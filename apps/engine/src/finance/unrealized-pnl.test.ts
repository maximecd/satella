import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

import { engineTestLayer } from "../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "./finance.test-utils.js";
import { reconcileConnector } from "./connector.js";

describe("unrealized P&L", () => {
  it.effect("derives a currency-inclusive Position P&L from its current quantity", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO asset_prices
        (asset_id, price, currency_asset_id, source, observed_at, updated_at)
        VALUES ('fiat:EUR', '1.25', 'fiat:USD', 'test', '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')`;
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Foreign stock",
        symbol: "FOREIGN",
        identifiers: [],
      });
      yield* Finance.setManualPrice(asset.id, {
        price: "12",
        currencyAssetId: "fiat:USD",
      });
      const account = yield* Finance.createAccount({ name: "Brokerage" });
      const withPosition = yield* Finance.createPosition({
        accountId: account.id,
        assetId: asset.id,
        quantity: "2",
        averageUnitPurchasePrice: {
          price: "10",
          currencyAssetId: "fiat:EUR",
        },
      });
      const position = withPosition.positions[0]!;

      expect(position.averageUnitPurchasePrice).toEqual(
        expect.objectContaining({
          price: "10",
          currencyAssetId: "fiat:EUR",
          currencyIso: "EUR",
          source: "manual",
        }),
      );
      expect(position.acquisitionCost).toBe("20");
      expect(position.reportingValue).toBe("24");
      expect(position.unrealizedPnl).toBe("-1");
      expect(position.unrealizedPnlPercent).toBe("-0.04");
      expect(withPosition.unrealizedPnl).toBe("-1");
      expect(withPosition.unrealizedPnlPercent).toBe("-0.04");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("keeps manual authority through quantity changes and connector refreshes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Connected fund",
        symbol: "FUND",
        identifiers: [],
      });
      yield* Finance.setManualPrice(asset.id, {
        price: "12",
        currencyAssetId: "fiat:USD",
      });
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO connections (id, name, connector_id, config_json, created_at, updated_at)
        VALUES ('connection-1', 'Custodian', 'fixture', '{}', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO accounts
        (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('connected-account', 'connection-1', 'Custody', 'fiat:USD', 'custody', ${timestamp}, ${timestamp})`;

      const connectorAsset = {
        externalAssetId: "fixture:fund",
        assetCategory: "other" as const,
        name: "Connected fund",
        symbol: "FUND",
        identifiers: [],
      };
      const reconcile = (quantity: string, average?: string) =>
        reconcileConnector("connection-1", {
          complete: true,
          assets: [connectorAsset],
          accounts: [
            {
              externalAccountId: "custody",
              name: "Custody",
              baseCurrencyIso: "USD",
              positions: [
                {
                  externalAssetId: "fixture:fund",
                  quantity,
                  ...(average === undefined
                    ? {}
                    : {
                        averageUnitPurchasePrice: {
                          price: average,
                          currencyIso: "USD",
                        },
                      }),
                },
              ],
            },
          ],
        });

      yield* reconcile("2", "5");
      let account = yield* Finance.getAccount("connected-account");
      let position = account.positions[0]!;
      expect(position.averageUnitPurchasePrice).toEqual(
        expect.objectContaining({ price: "5", source: "connection" }),
      );
      expect(position.acquisitionCost).toBe("10");

      yield* reconcile("3", "6");
      account = yield* Finance.getAccount("connected-account");
      position = account.positions[0]!;
      expect(position.averageUnitPurchasePrice).toEqual(
        expect.objectContaining({ price: "6", source: "connection" }),
      );
      expect(position.acquisitionCost).toBe("18");

      yield* reconcile("4");
      account = yield* Finance.getAccount("connected-account");
      position = account.positions[0]!;
      expect(position.averageUnitPurchasePrice?.price).toBe("6");
      expect(position.acquisitionCost).toBe("24");

      yield* Finance.updatePosition(position.id, {
        averageUnitPurchasePrice: { price: "7", currencyAssetId: "fiat:USD" },
      });
      yield* reconcile("5", "8");
      account = yield* Finance.getAccount("connected-account");
      position = account.positions[0]!;
      expect(position.averageUnitPurchasePrice).toEqual(
        expect.objectContaining({ price: "7", source: "manual" }),
      );
      expect(position.acquisitionCost).toBe("35");

      yield* Finance.updatePosition(position.id, { averageUnitPurchasePrice: null });
      account = yield* Finance.getAccount("connected-account");
      position = account.positions[0]!;
      expect(position.averageUnitPurchasePrice).toEqual(
        expect.objectContaining({ price: "8", source: "connection" }),
      );
      expect(position.acquisitionCost).toBe("40");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("excludes unknown, Cash, zero, and negative positions from aggregates", () =>
    Effect.gen(function* () {
      const account = yield* Finance.createAccount({ name: "Mixed holdings" });
      const winning = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Winner",
        identifiers: [],
      });
      const losing = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Loser",
        identifiers: [],
      });
      const unknown = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Unknown cost",
        identifiers: [],
      });
      const zero = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Closed",
        identifiers: [],
      });
      const short = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Short",
        identifiers: [],
      });
      for (const [assetId, price] of [
        [winning.id, "15"],
        [losing.id, "90"],
        [unknown.id, "30"],
        [zero.id, "30"],
        [short.id, "30"],
      ] as const) {
        yield* Finance.setManualPrice(assetId, {
          price,
          currencyAssetId: "fiat:USD",
        });
      }
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: winning.id,
        quantity: "2",
        averageUnitPurchasePrice: { price: "10", currencyAssetId: "fiat:USD" },
      });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: losing.id,
        quantity: "1",
        averageUnitPurchasePrice: { price: "100", currencyAssetId: "fiat:USD" },
      });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: unknown.id,
        quantity: "1",
      });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: zero.id,
        quantity: "0",
        averageUnitPurchasePrice: { price: "10", currencyAssetId: "fiat:USD" },
      });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: short.id,
        quantity: "-1",
        averageUnitPurchasePrice: { price: "10", currencyAssetId: "fiat:USD" },
      });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: "fiat:USD",
        quantity: "100",
      });

      const valued = yield* Finance.getAccount(account.id);
      expect(valued.unrealizedPnl).toBe("0");
      expect(valued.unrealizedPnlPercent).toBe("0");
      expect(valued.positions.find(({ assetId }) => assetId === unknown.id)?.unrealizedPnl).toBe(
        null,
      );
      expect(valued.positions.find(({ assetId }) => assetId === zero.id)?.unrealizedPnl).toBe(null);
      expect(valued.positions.find(({ assetId }) => assetId === short.id)?.unrealizedPnl).toBe(
        null,
      );
      const dashboard = yield* Finance.getDashboard();
      expect(dashboard.unrealizedPnl).toBe("0");
      expect(dashboard.unrealizedPnlPercent).toBe("0");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("re-expresses P&L in the Reporting currency without changing market history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO asset_prices
        (asset_id, price, currency_asset_id, source, observed_at, updated_at)
        VALUES ('fiat:EUR', '1.25', 'fiat:USD', 'test', '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')`;
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Foreign asset",
        identifiers: [],
      });
      yield* Finance.setManualPrice(asset.id, {
        price: "12",
        currencyAssetId: "fiat:USD",
      });
      const account = yield* Finance.createAccount({ name: "Brokerage" });
      yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: "2" });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T00:00:00.000Z"),
      });
      const before = yield* Finance.getAccount(account.id);
      yield* Finance.updatePosition(before.positions[0]!.id, {
        averageUnitPurchasePrice: { price: "10", currencyAssetId: "fiat:EUR" },
      });
      const after = yield* Finance.getAccount(account.id);
      expect(after.total).toBe(before.total);
      expect(after.unrealizedPnl).toBe("-1");
      expect((yield* Finance.getPortfolioHistory())[0]?.total).toBe("24");

      yield* Finance.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
      const dashboard = yield* Finance.getDashboard();
      expect(dashboard.portfolioValue).toBe("19.2");
      expect(dashboard.unrealizedPnl).toBe("-0.8");
      expect(dashboard.unrealizedPnlPercent).toBe("-0.04");
      expect((yield* Finance.getPortfolioHistory())[0]?.total).toBe("19.2");
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
