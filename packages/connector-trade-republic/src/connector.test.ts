import { EventEmitter } from "node:events";

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  makeEffectWebSocketTransport,
  makeTradeRepublicConnector,
  parseTradeRepublicSnapshot,
  type TradeRepublicWebSocketFactory,
  type TradeRepublicBrowserAttempt,
  type TradeRepublicJsonValue,
} from "./index.js";

const snapshot = {
  accounts: [
    {
      accountNumber: "SEC-1",
      wrapper: "default",
      name: "Trade Republic",
      currency: "EUR",
      cash: { amount: "42.50", currency: "EUR" },
      positions: [
        {
          isin: "FR0000000001",
          instrumentId: "instrument-1",
          type: "stock",
          name: "Example SA",
          symbol: "EXM",
          netSize: "1.250000",
          averageBuyIn: { price: "10.25", currency: "EUR" },
          quote: {
            last: { price: "12.50" },
            currency: "EUR",
            observedAt: "2026-08-23T08:00:00.000Z",
          },
        },
        {
          isin: "XX0000000002",
          instrumentId: "private-1",
          type: "privateFund",
          name: "Private fund",
          netSize: "2",
          averageBuyIn: { price: "20", currency: "EUR" },
        },
        {
          isin: "XX0000000003",
          instrumentId: "crypto-1",
          type: "crypto",
          name: "Example Coin",
          netSize: "0.000000123456",
        },
      ],
    },
    {
      accountNumber: "PEA-1",
      wrapper: "tax_wrapper_fr",
      currency: "EUR",
      cash: { amount: "100", currency: "EUR" },
      positions: [],
    },
    {
      accountNumber: "SEC-2",
      wrapper: "regional_wrapper",
      currency: "CHF",
      positions: [],
    },
  ],
  cashAccounts: [{ accountNumber: "CASH-1", type: "cash", currency: "EUR", balance: "500.75" }],
};

const asJsonValue = <T>(value: T): TradeRepublicJsonValue => {
  // SAFETY: JSON serialization is the same boundary used by the transport fixture.
  return JSON.parse(JSON.stringify(value)) as TradeRepublicJsonValue;
};

describe("Trade Republic connector", () => {
  it("uses the read-only WebSocket topics and accepts rotated session cookies", async () => {
    class FakeSocket extends EventEmitter {
      readyState = 0;
      readonly sent: string[] = [];

      send(message: string) {
        this.sent.push(message);
        // SAFETY: this test controls every message sent by the fake transport.
        const parsed = JSON.parse(message) as {
          readonly type: string;
          readonly id?: string;
          readonly payload?: { readonly type?: string };
        };
        if (parsed.type !== "sub" || parsed.id === undefined) return;
        const payload =
          parsed.payload?.type === "compactPortfolioByType"
            ? {
                accounts: [
                  {
                    accountNumber: "SEC-1",
                    currency: "EUR",
                    positions: [
                      {
                        isin: "FR0000000001",
                        instrumentId: "instrument-1",
                        type: "stock",
                        netSize: "1",
                      },
                    ],
                  },
                ],
                cashAccounts: [
                  { accountNumber: "CASH-1", type: "cash", currency: "EUR", balance: "10" },
                ],
              }
            : parsed.payload?.type === "ticker"
              ? { last: { price: "12.50", time: 1787472000000 }, currency: "EUR" }
              : {};
        this.emit("message", Buffer.from(JSON.stringify({ id: parsed.id, payload })));
      }

      close() {
        this.readyState = 3;
        this.emit("close");
      }
    }

    let socket: FakeSocket | undefined;
    let seenUrl = "";
    let seenHeaders: Readonly<Record<string, string>> | undefined;
    const factory: TradeRepublicWebSocketFactory = (url, options) => {
      seenUrl = url;
      seenHeaders = options.headers;
      socket = new FakeSocket();
      const created = socket;
      queueMicrotask(() => {
        created.readyState = 1;
        created.emit("upgrade", {
          headers: { "set-cookie": ["tr_session=rotated; Path=/", "tr_refresh=next; Path=/"] },
        });
        created.emit("open");
      });
      return created;
    };
    const transport = makeEffectWebSocketTransport(
      "wss://fixture.invalid/",
      Duration.seconds(2),
      factory,
    );
    const result = await Effect.runPromise(
      transport.fetchSnapshot({ sessionToken: "session", refreshToken: "refresh" }),
    );

    expect(seenUrl).toBe("wss://fixture.invalid/");
    expect(seenHeaders?.Cookie).toBe("tr_session=session; tr_refresh=refresh");
    expect(seenHeaders?.["x-tr-protocol-version"]).toBe("31");
    expect(socket?.sent.map((message) => JSON.parse(message).type)).toEqual([
      "connect",
      "sub",
      "sub",
      "sub",
    ]);
    expect(JSON.parse(socket?.sent[3] ?? "{}").payload.id).toBe("FR0000000001.LSX");
    expect(result).toMatchObject({
      session: { sessionToken: "rotated", refreshToken: "next" },
      snapshot: { accounts: [{ accountNumber: "SEC-1" }], cashAccounts: [{ balance: "10" }] },
    });
    expect(result).toMatchObject({
      snapshot: {
        accounts: [{ positions: [{ quote: { last: { price: "12.50" }, currency: "EUR" } }] }],
      },
    });
  });

  it("returns a partial snapshot when a discovered quote topic fails", async () => {
    const sessionToken = `header.${Buffer.from(
      JSON.stringify({ act: { acc: { owner: [{ number: "SEC-1" }] } } }),
    ).toString("base64url")}.signature`;
    class FakeSocket extends EventEmitter {
      readyState = 0;

      send(message: string) {
        // SAFETY: this test controls every message sent by the fake transport.
        const parsed = JSON.parse(message) as {
          readonly type: string;
          readonly id?: string;
          readonly payload?: { readonly type?: string };
        };
        if (parsed.type !== "sub" || parsed.id === undefined) return;
        if (parsed.payload?.type === "ticker") {
          this.emit(
            "message",
            Buffer.from(JSON.stringify({ type: "error", id: parsed.id, status: 404 })),
          );
          return;
        }
        const payload =
          parsed.payload?.type === "compactPortfolioByType"
            ? {
                accounts: [
                  {
                    accountNumber: "SEC-1",
                    currency: "EUR",
                    positions: [
                      {
                        isin: "FR0000000001",
                        instrumentId: "instrument-1",
                        type: "stock",
                        netSize: "1",
                      },
                    ],
                  },
                ],
              }
            : {
                cashAccounts: [
                  { accountNumber: "CASH-1", type: "cash", currency: "EUR", balance: "10" },
                ],
              };
        this.emit("message", Buffer.from(JSON.stringify({ id: parsed.id, payload })));
      }

      close() {
        this.readyState = 3;
        this.emit("close");
      }
    }

    const factory: TradeRepublicWebSocketFactory = (_url, _options) => {
      const socket = new FakeSocket();
      queueMicrotask(() => {
        socket.readyState = 1;
        socket.emit("open");
      });
      return socket;
    };
    const transport = makeEffectWebSocketTransport(
      "wss://fixture.invalid/",
      Duration.seconds(2),
      factory,
    );
    const result = await Effect.runPromise(
      transport.fetchSnapshot({ sessionToken, refreshToken: "refresh" }),
    );

    expect(result).toMatchObject({
      complete: false,
      accounts: [{ accountNumber: "SEC-1" }],
      cashAccounts: [{ accountNumber: "CASH-1" }],
    });
  });

  it("discovers brokerage, checking, PEA, and unknown wrappers without inventing a PEA", () => {
    const result = parseTradeRepublicSnapshot(asJsonValue(snapshot));
    expect(result.complete).toBe(true);
    expect(result.accounts.map(({ externalId }) => externalId)).toEqual([
      "SEC-1",
      "PEA-1",
      "SEC-2",
      "CASH-1",
    ]);
    expect(result.accounts.map(({ accountType }) => accountType)).toEqual([
      "brokerage",
      "brokerage",
      "brokerage",
      "checking",
    ]);
    expect(result.accounts[1]?.name).toBe("PEA");
    expect(result.accounts[1]?.positions[0]?.asset.assetCategory).toBe("cash");
    expect(result.accounts[0]?.positions[0]?.asset.identifiers).toContainEqual({
      type: "isin",
      value: "FR0000000001",
    });
    expect(result.accounts[0]?.positions[0]?.quantity).toBe("1.25");
    expect(result.accounts[0]?.positions[0]?.reportedPrice?.price).toBe("12.5");
    expect(result.accounts[0]?.positions[1]?.asset.assetCategory).toBe("other");
    expect(result.accounts[0]?.positions[2]?.asset.assetCategory).toBe("crypto");
    expect(result.accounts[2]?.name).toBe("regional_wrapper");
  });

  it("retains usable wrappers as a partial snapshot and rejects an empty response", () => {
    const result = parseTradeRepublicSnapshot(
      asJsonValue({
        complete: false,
        failedAccounts: ["PEA-1"],
        accounts: [snapshot.accounts[0]],
      }),
    );
    expect(result.complete).toBe(false);
    expect(result.accounts).toHaveLength(1);
    expect(() => parseTradeRepublicSnapshot(asJsonValue({ accounts: [] }))).toThrow("no accounts");
    const failedWrapper = parseTradeRepublicSnapshot(
      asJsonValue({
        accounts: [
          {
            accountNumber: "BROKEN-1",
            wrapper: "regional_wrapper",
            currency: "CHF",
            error: { code: "topic_failed" },
          },
          snapshot.accounts[0],
        ],
      }),
    );
    expect(failedWrapper.complete).toBe(false);
    expect(failedWrapper.accounts.map(({ externalId }) => externalId)).toContain("BROKEN-1");
  });

  it("keeps browser credentials transient and closes the attempt after completion", async () => {
    let closed = 0;
    const browserAttempt: TradeRepublicBrowserAttempt = {
      challenge: {
        kind: "confirmation_code",
        prompt: "Enter the four-digit confirmation code",
        length: 4,
        expiresAt: "2026-08-23T08:02:00.000Z",
      },
      submitCode: (code) =>
        Effect.succeed({ sessionToken: `session-${code}`, refreshToken: "refresh-token" }),
      close: () => Effect.sync(() => void (closed += 1)),
    };
    const connector = makeTradeRepublicConnector({
      now: () => new Date("2026-08-23T08:00:00.000Z"),
      browserRuntime: {
        start: (input) => {
          expect(input.phone).toBe("+33123456789");
          expect(input.pin).toBe("1234");
          return Effect.succeed(browserAttempt);
        },
      },
      transportFactory: () => ({ fetchSnapshot: () => Effect.succeed(snapshot) }),
    });
    const flow = await Effect.runPromise(
      connector.startAuthentication!({ phone: "+33123456789", pin: "1234" }),
    );
    const authenticated = await Effect.runPromise(flow.submit("9876"));
    expect(authenticated.session).toEqual({
      sessionToken: "session-9876",
      refreshToken: "refresh-token",
    });
    expect(closed).toBe(1);
    const accounts = await Effect.runPromise(authenticated.fetchAccounts());
    expect("accounts" in accounts ? accounts.accounts : accounts).toHaveLength(4);
  });
});
