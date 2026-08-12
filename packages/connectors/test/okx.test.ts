import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import {
  makeOkxConnector,
  signOkxRequest,
  type OkxHttpRequest,
  type OkxHttpResponse,
  type OkxHttpTransport,
} from "../src/index.js";

const now = new Date("2020-12-08T09:21:46.894Z");

const response = (body: unknown, status = 200): OkxHttpResponse => ({
  status,
  headers: {},
  body,
});

const credentials = {
  apiKey: "api-key",
  secretKey: "secret",
  passphrase: "passphrase",
  region: "eea" as const,
  environment: "demo" as const,
};

describe("OKX connector", () => {
  it("signs the documented pre-hash format", () => {
    expect(
      signOkxRequest({
        timestamp: now.toISOString(),
        method: "GET",
        requestPath: "/api/v5/account/balance",
        secretKey: "secret",
      }),
    ).toBe("OWOguzG9XJX/9SExvPOCjgJfbD91qvK9J4ZhTihuSZU=");
  });

  it("authenticates and maps trading and funding balances into nested positions", async () => {
    const requests: OkxHttpRequest[] = [];
    const transport: OkxHttpTransport = {
      request: (request) => {
        requests.push(request);
        if (request.path === "/api/v5/public/time") {
          return Effect.succeed(
            response({ code: "0", msg: "", data: [{ ts: String(now.getTime()) }] }),
          );
        }
        if (request.path === "/api/v5/account/config") {
          return Effect.succeed(response({ code: "0", msg: "", data: [{ acctLv: "1" }] }));
        }
        if (request.path === "/api/v5/account/balance") {
          return Effect.succeed(
            response({
              code: "0",
              msg: "",
              data: [
                {
                  details: [
                    { ccy: "BTC", cashBal: "1.5" },
                    { ccy: "USD", cashBal: "0" },
                  ],
                },
              ],
            }),
          );
        }
        return Effect.succeed(
          response({
            code: "0",
            msg: "",
            data: [
              { ccy: "BTC", bal: "2" },
              { ccy: "USDT", bal: "4.25" },
            ],
          }),
        );
      },
    };

    const authenticated = await Effect.runPromise(
      makeOkxConnector({
        transportFactory: () => transport,
        now: () => now,
        maxAttempts: 1,
      }).authenticate(credentials),
    );
    const accounts = await Effect.runPromise(authenticated.fetchAccounts());

    expect(accounts).toEqual([
      {
        externalId: "trading",
        name: "Trading",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "okx:currency:BTC",
              assetClass: "crypto",
              name: "BTC",
              symbol: "BTC",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
            quantity: 1.5,
          },
        ],
      },
      {
        externalId: "funding",
        name: "Funding",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "okx:currency:BTC",
              assetClass: "crypto",
              name: "BTC",
              symbol: "BTC",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
            quantity: 2,
          },
          {
            asset: {
              externalId: "okx:currency:USDT",
              assetClass: "crypto",
              name: "USDT",
              symbol: "USDT",
              identifiers: [{ type: "okx_currency", value: "USDT" }],
            },
            quantity: 4.25,
          },
        ],
      },
    ]);
    expect(requests.map(({ path }) => path)).toEqual([
      "/api/v5/public/time",
      "/api/v5/account/config",
      "/api/v5/account/balance",
      "/api/v5/asset/balances",
    ]);
    expect(requests[1]?.headers["x-simulated-trading"]).toBe("1");
    expect(requests[1]?.headers["OK-ACCESS-KEY"]).toBe("api-key");
    expect(requests[1]?.headers["OK-ACCESS-SIGN"]).toBeDefined();
  });

  it("fails the complete fetch when one balance endpoint fails", async () => {
    const transport: OkxHttpTransport = {
      request: (request) => {
        if (request.path === "/api/v5/public/time") {
          return Effect.succeed(
            response({ code: "0", msg: "", data: [{ ts: String(now.getTime()) }] }),
          );
        }
        if (request.path === "/api/v5/account/config") {
          return Effect.succeed(response({ code: "0", msg: "", data: [{}] }));
        }
        if (request.path === "/api/v5/asset/balances") {
          return Effect.succeed(response({ code: "50011", msg: "rate limit", data: [] }));
        }
        return Effect.succeed(
          response({
            code: "0",
            msg: "",
            data: [{ details: [{ ccy: "BTC", cashBal: "1" }] }],
          }),
        );
      },
    };
    const authenticated = await Effect.runPromise(
      makeOkxConnector({
        transportFactory: () => transport,
        now: () => now,
        maxAttempts: 1,
      }).authenticate(credentials),
    );

    await expect(Effect.runPromise(authenticated.fetchAccounts())).rejects.toThrow(
      "OKX rejected the account request",
    );
  });
});
