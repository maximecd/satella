import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";

import { engineTestLayer } from "../database/database.test-utils.js";
import { reconcileConnector } from "./connector.js";
import * as Finance from "./finance.test-utils.js";

describe("connector reconciliation", () => {
  it.effect("repairs an existing connector mapping with the automatic asset lookup", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const timestamp = new Date().toISOString();
        const automatic = yield* Finance.createAsset({
          assetCategory: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        });
        const legacy = yield* Finance.createAsset({
          assetCategory: "crypto",
          name: "BTC",
          symbol: "BTC",
          identifiers: [{ type: "okx_currency", value: "BTC" }],
        });
        yield* Finance.seedSyncedCustodian({
          id: "synced",
          name: "Broker",
          connectorId: "okx",
          accounts: [
            {
              id: "trading",
              name: "Trading",
              connectorAccountId: "trading",
              accountType: "crypto_wallet",
            },
          ],
        });
        yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
            VALUES ('btc-position', 'trading', ${legacy.id}, 1, ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO connector_asset_mappings (custodian_id, external_asset_id, asset_id)
            VALUES ('synced', 'okx:currency:BTC', ${legacy.id})`;
        yield* reconcileConnector("synced", {
          complete: true,
          assets: [
            {
              externalAssetId: "okx:currency:BTC",
              assetCategory: "crypto",
              name: "BTC",
              symbol: "BTC",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
          ],
          accounts: [
            {
              externalAccountId: "trading",
              name: "Trading",
              baseCurrencyIso: "USD",
              positions: [{ externalAssetId: "okx:currency:BTC", quantity: "2" }],
            },
          ],
        });
        return {
          automatic: yield* Finance.getAsset(automatic.id),
          legacyId: legacy.id,
          assets: yield* Finance.listAssets(),
          account: yield* Finance.getAccount("trading"),
        };
      });

      expect(result.assets.some(({ id }) => id === result.legacyId)).toBe(false);
      expect(result.automatic.identifiers).toEqual(
        expect.arrayContaining([
          { type: "coingecko_coin_id", value: "bitcoin" },
          { type: "okx_currency", value: "BTC" },
        ]),
      );
      expect(result.account.positions.find(({ quantity }) => quantity !== "0")?.assetId).toBe(
        result.automatic.id,
      );
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("reuses an existing automatic asset when a connector symbol matches", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        const bitcoin = yield* Finance.createAsset({
          assetCategory: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        });
        yield* Finance.seedSyncedCustodian({
          id: "synced",
          name: "Broker",
          connectorId: "okx",
        });
        yield* reconcileConnector("synced", {
          complete: true,
          assets: [
            {
              externalAssetId: "okx:currency:BTC",
              assetCategory: "crypto",
              name: "BTC",
              symbol: "BTC",
              identifiers: [{ type: "okx_currency", value: "BTC" }],
            },
          ],
          accounts: [
            {
              externalAccountId: "trading",
              name: "Trading",
              baseCurrencyIso: "USD",
              positions: [{ externalAssetId: "okx:currency:BTC", quantity: "1" }],
            },
          ],
        });
        const custodian = yield* Finance.getCustodian("synced");
        const account = yield* Finance.getAccount(custodian.accounts[0]!.id);
        return { bitcoin, account };
      });

      expect(result.account.positions[0]?.assetId).toBe(result.bitcoin.id);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("upserts stable identities and reconciles absence only after complete output", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        yield* Finance.seedSyncedCustodian({
          id: "synced",
          name: "Broker",
          connectorId: "fixture",
        });
        const asset = {
          externalAssetId: "instrument-1",
          assetCategory: "stocks_etfs" as const,
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        };
        yield* reconcileConnector("synced", {
          complete: true,
          assets: [asset],
          accounts: [
            {
              externalAccountId: "account-1",
              name: "Portfolio",
              baseCurrencyIso: "USD",
              positions: [{ externalAssetId: "instrument-1", quantity: "4" }],
            },
          ],
        });
        const created = yield* Finance.getCustodian("synced");
        const accountId = created.accounts[0]!.id;
        yield* reconcileConnector("synced", { complete: false, assets: [], accounts: [] });
        const afterPartial = yield* Finance.getAccount(accountId);
        const zeroResult = yield* reconcileConnector("synced", {
          complete: true,
          assets: [asset],
          accounts: [
            {
              externalAccountId: "account-1",
              name: "Renamed portfolio",
              baseCurrencyIso: "USD",
              positions: [],
            },
          ],
        });
        const zeroed = yield* Finance.getAccount(accountId);
        const removeResult = yield* reconcileConnector("synced", {
          complete: true,
          assets: [],
          accounts: [],
        });
        const finalCustodian = yield* Finance.getCustodian("synced");
        return { afterPartial, zeroResult, zeroed, removeResult, finalCustodian };
      });

      expect(result.afterPartial.positions[0]?.quantity).toBe("4");
      expect(result.zeroResult.zeroedPositionCount).toBe(1);
      expect(result.zeroed.name).toBe("Renamed portfolio");
      expect(result.zeroed.positions[0]?.quantity).toBe("0");
      expect(result.removeResult.removedAccountCount).toBe(1);
      expect(result.finalCustodian.accounts).toEqual([]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
