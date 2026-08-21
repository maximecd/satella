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
    positions: [
      {
        asset: {
          externalId: "okx:currency:BTC",
          assetCategory: "crypto" as const,
          name: "BTC",
          symbol: "BTC",
          identifiers: [{ type: "okx_currency", value: "BTC" }],
        },
        quantity: "1.5",
      },
    ],
  },
  {
    externalId: "funding",
    name: "Funding",
    baseCurrencyIso: "USD",
    positions: [],
  },
] as const;

describe("connector service bridge", () => {
  it.effect("keeps nested connector accounts until atomic reconciliation", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        yield* Finance.seedSyncedCustodian({
          id: "okx",
          name: "OKX",
          connectorId: "okx",
        });
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
        positions: [
          {
            asset: {
              externalId: "same",
              assetCategory: "crypto",
              name: "BTC",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
            quantity: "1",
          },
        ],
      },
      {
        externalId: "two",
        name: "Two",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "same",
              assetCategory: "crypto",
              name: "Bitcoin",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
            quantity: "1",
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
