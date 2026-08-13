import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";

import { engineTestLayer } from "../database/database.test-utils.js";
import { normalizeConnectorAccounts, reconcileConnectorAccounts } from "./connector-service.js";
import * as Finance from "./finance.test-utils.js";

const accounts = [
  {
    externalId: "trading",
    name: "Trading",
    baseCurrencyIso: "USD",
    accountKind: "crypto" as const,
    positions: [
      {
        asset: {
          externalId: "okx:currency:BTC",
          assetClass: "crypto" as const,
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
    accountKind: "crypto" as const,
    positions: [],
  },
] as const;

describe("connector service bridge", () => {
  it.effect("keeps nested connector accounts until atomic reconciliation", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const timestamp = new Date().toISOString();
        yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
            VALUES ('okx', 'OKX', 'synced', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO custodian_connectors
            (custodian_id, connector_id, config_json, created_at, updated_at)
            VALUES ('okx', 'okx', '{}', ${timestamp}, ${timestamp})`;
        const reconciliation = yield* reconcileConnectorAccounts("okx", accounts);
        return { reconciliation, custodian: yield* Finance.getCustodian("okx") };
      });
      expect(result.reconciliation).toEqual({
        accountCount: 2,
        positionCount: 1,
        zeroedPositionCount: 0,
        removedAccountCount: 0,
      });
      expect(result.custodian.accounts.map(({ name }) => name).sort()).toEqual([
        "Funding",
        "Trading",
      ]);
      expect(
        result.custodian.accounts.map(({ connectorAccountId }) => connectorAccountId).sort(),
      ).toEqual(["funding", "trading"]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects conflicting definitions for one connector asset", () =>
    normalizeConnectorAccounts([
      {
        externalId: "one",
        name: "One",
        baseCurrencyIso: "USD",
        accountKind: "crypto" as const,
        positions: [
          {
            asset: {
              externalId: "same",
              assetClass: "crypto",
              name: "BTC",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
            quantity: 1,
          },
        ],
      },
      {
        externalId: "two",
        name: "Two",
        baseCurrencyIso: "USD",
        accountKind: "crypto" as const,
        positions: [
          {
            asset: {
              externalId: "same",
              assetClass: "crypto",
              name: "Bitcoin",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
            quantity: 1,
          },
        ],
      },
    ]).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(String(error)).toContain("conflicting definitions");
        }),
      ),
    ),
  );
});
