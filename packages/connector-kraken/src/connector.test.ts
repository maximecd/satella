import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  KrakenTransportError,
  makeKrakenConnector,
  signKrakenRequest,
  type KrakenHttpRequest,
  type KrakenHttpResponse,
  type KrakenHttpTransport,
} from "./index.js";

const now = new Date("2020-12-08T09:21:46.894Z");

const unexpectedPath = () =>
  Effect.fail(new KrakenTransportError("unexpected path", { transient: false }));

const response = (body: KrakenHttpResponse["body"], status = 200): KrakenHttpResponse => ({
  status,
  headers: {},
  body,
});

const credentials = {
  apiKey: "api-key",
  apiSecret:
    "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==",
};

describe("Kraken connector", () => {
  it("signs the documented pre-hash format", () => {
    expect(
      signKrakenRequest({
        path: "/0/private/AddOrder",
        nonce: "1616492376594",
        body: "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25",
        secret:
          "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==",
      }),
    ).toBe(
      "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==",
    );
  });

  it("authenticates and maps spot and earn balances into accounts", async () => {
    const requests: KrakenHttpRequest[] = [];
    const transport: KrakenHttpTransport = {
      request: (request) => {
        requests.push(request);
        if (request.path === "/0/private/Balance") {
          return Effect.succeed(
            response({
              error: [],
              result: {
                XXBT: "1.5000000000",
                ZUSD: "250.50",
                USDT: "0",
                "ETH2.S": "0.4000000000",
                "ADA.F": "1.5",
                "TSLA.T": "3",
                SOL: "2",
              },
            }),
          );
        }
        if (request.path === "/0/private/Earn/Strategies") {
          return Effect.succeed(
            response({
              error: [],
              result: {
                items: [
                  { id: "ES-ETH", lock_type: { type: "bonded" } },
                  { id: "ES-DOT", lock_type: { type: "flex" } },
                  { id: "ES-SOL", lock_type: { type: "instant" } },
                ],
              },
            }),
          );
        }
        if (request.path === "/0/private/Earn/Allocations") {
          return Effect.succeed(
            response({
              error: [],
              result: {
                items: [
                  {
                    strategy_id: "ES-ETH",
                    native_asset: "ETH",
                    amount_allocated: { total: { native: "0.0210000000" } },
                  },
                  {
                    strategy_id: "ES-DOT",
                    native_asset: "DOT",
                    amount_allocated: { total: { native: "5" } },
                  },
                  {
                    strategy_id: "ES-SOL",
                    native_asset: "SOL",
                    amount_allocated: { total: { native: "1" } },
                  },
                ],
              },
            }),
          );
        }
        return unexpectedPath();
      },
    };

    const authenticated = await Effect.runPromise(
      makeKrakenConnector({ transportFactory: () => transport, now: () => now }).authenticate(
        credentials,
      ),
    );
    const accounts = await Effect.runPromise(authenticated.fetchAccounts());

    expect(accounts).toEqual([
      {
        externalId: "spot",
        name: "Spot",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "kraken:currency:XXBT",
              assetCategory: "crypto",
              name: "BTC",
              symbol: "BTC",
              identifiers: [{ type: "kraken_currency", value: "XXBT" }],
            },
            quantity: "1.5",
          },
          {
            asset: {
              externalId: "kraken:currency:ZUSD",
              assetCategory: "cash",
              name: "USD",
              symbol: "USD",
              identifiers: [{ type: "kraken_currency", value: "ZUSD" }],
            },
            quantity: "250.5",
          },
          {
            asset: {
              externalId: "kraken:currency:ADA.F",
              assetCategory: "crypto",
              name: "ADA",
              symbol: "ADA",
              identifiers: [{ type: "kraken_currency", value: "ADA.F" }],
            },
            quantity: "1.5",
          },
          {
            asset: {
              externalId: "kraken:currency:TSLA.T",
              assetCategory: "stocks_etfs",
              name: "TSLA",
              symbol: "TSLA",
              identifiers: [{ type: "kraken_currency", value: "TSLA.T" }],
            },
            quantity: "3",
          },
          {
            asset: {
              externalId: "kraken:currency:SOL",
              assetCategory: "crypto",
              name: "SOL",
              symbol: "SOL",
              identifiers: [{ type: "kraken_currency", value: "SOL" }],
            },
            quantity: "2",
          },
        ],
      },
      {
        externalId: "earn",
        name: "Earn",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "kraken:currency:ETH",
              assetCategory: "crypto",
              name: "ETH",
              symbol: "ETH",
              identifiers: [{ type: "kraken_currency", value: "ETH" }],
            },
            quantity: "0.021",
          },
          {
            asset: {
              externalId: "kraken:currency:SOL",
              assetCategory: "crypto",
              name: "SOL",
              symbol: "SOL",
              identifiers: [{ type: "kraken_currency", value: "SOL" }],
            },
            quantity: "1",
          },
        ],
      },
    ]);
    expect(requests).toHaveLength(4);
    expect(requests[0]?.path).toBe("/0/private/Balance");
    expect(
      requests
        .slice(1)
        .map(({ path }) => path)
        .sort(),
    ).toEqual(["/0/private/Balance", "/0/private/Earn/Allocations", "/0/private/Earn/Strategies"]);
    expect(new URLSearchParams(requests[0]?.body ?? "").get("hide_zero_allocations")).toBeNull();
    for (const request of requests) {
      expect(request.headers["API-Key"]).toBe("api-key");
      expect(request.headers["API-Sign"]).toBeDefined();
      expect(request.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    }
    const nonces = requests.map(({ body }) => Number(new URLSearchParams(body).get("nonce")));
    nonces.slice(1).forEach((current, index) => {
      const previous = nonces[index];
      if (previous !== undefined) {
        expect(current).toBeGreaterThan(previous);
      }
    });
    const allocationsRequest = requests.find(({ path }) => path === "/0/private/Earn/Allocations");
    expect(new URLSearchParams(allocationsRequest?.body ?? "").get("hide_zero_allocations")).toBe(
      "true",
    );
  });

  it("merges staking-suffix balances into one Earn position per asset", async () => {
    const transport: KrakenHttpTransport = {
      request: (request) => {
        if (request.path === "/0/private/Balance") {
          return Effect.succeed(
            response({
              error: [],
              result: { "ADA.S": "1", "ADA.B": "0.25", "ADA.F": "0.5" },
            }),
          );
        }
        if (request.path === "/0/private/Earn/Strategies") {
          return Effect.succeed(response({ error: [], result: { items: [] } }));
        }
        if (request.path === "/0/private/Earn/Allocations") {
          return Effect.succeed(response({ error: [], result: { items: [] } }));
        }
        return unexpectedPath();
      },
    };
    const authenticated = await Effect.runPromise(
      makeKrakenConnector({ transportFactory: () => transport, now: () => now }).authenticate(
        credentials,
      ),
    );
    const accounts = await Effect.runPromise(authenticated.fetchAccounts());

    expect(accounts).toEqual([
      {
        externalId: "spot",
        name: "Spot",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "kraken:currency:ADA.F",
              assetCategory: "crypto",
              name: "ADA",
              symbol: "ADA",
              identifiers: [{ type: "kraken_currency", value: "ADA.F" }],
            },
            quantity: "0.5",
          },
        ],
      },
      {
        externalId: "earn",
        name: "Earn",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "kraken:currency:ADA.S",
              assetCategory: "crypto",
              name: "ADA",
              symbol: "ADA",
              identifiers: [{ type: "kraken_currency", value: "ADA.S" }],
            },
            quantity: "1.25",
          },
        ],
      },
    ]);
  });

  it("exposes read-only credentials", () => {
    const connector = makeKrakenConnector();
    expect(connector.assetCategories).toEqual(["crypto"]);
    expect(connector.credentialFields.map(({ key }) => key)).toEqual(["apiKey", "apiSecret"]);
    expect(connector.icon).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(connector.instructions).toContain("Create a read-only API key");
  });

  it("fails the fetch when Kraken reports an API error", async () => {
    const transport: KrakenHttpTransport = {
      request: (request) => {
        if (request.path === "/0/private/Balance") {
          return Effect.succeed(response({ error: [], result: {} }));
        }
        if (request.path === "/0/private/Earn/Strategies") {
          return Effect.succeed(response({ error: [], result: { items: [] } }));
        }
        if (request.path === "/0/private/Earn/Allocations") {
          return Effect.succeed(response({ error: ["EGeneral:Permission denied"], result: null }));
        }
        return unexpectedPath();
      },
    };
    const authenticated = await Effect.runPromise(
      makeKrakenConnector({ transportFactory: () => transport, now: () => now }).authenticate(
        credentials,
      ),
    );

    await expect(Effect.runPromise(authenticated.fetchAccounts())).rejects.toThrow(
      "Permission denied",
    );
  });

  it("maps invalid keys to invalid_credentials", async () => {
    const transport: KrakenHttpTransport = {
      request: () => Effect.succeed(response({ error: ["EAPI:Invalid key"], result: null })),
    };

    const failure = await Effect.runPromise(
      makeKrakenConnector({ transportFactory: () => transport, now: () => now })
        .authenticate(credentials)
        .pipe(Effect.flip),
    );
    expect(failure.category).toBe("invalid_credentials");
  });
});
