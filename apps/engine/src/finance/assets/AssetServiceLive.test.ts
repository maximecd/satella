import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("assets", () => {
  it.effect("reuses strong identifiers but never merges by name or ticker alone", () =>
    Effect.gen(function* () {
      const apple = yield* Finance.createAsset({
        assetCategory: "stocks_etfs",
        name: "Apple",
        symbol: "AAPL",
        identifiers: [{ type: "isin", value: "US0378331005" }],
      });
      const sameApple = yield* Finance.createAsset({
        assetCategory: "stocks_etfs",
        name: "Apple Inc.",
        symbol: "AAPL",
        identifiers: [{ type: "isin", value: "US0378331005" }],
      });
      const ambiguousApple = yield* Finance.createAsset({
        assetCategory: "stocks_etfs",
        name: "Apple",
        symbol: "AAPL",
        identifiers: [],
      });
      expect(sameApple.id).toBe(apple.id);
      expect(ambiguousApple.id).not.toBe(apple.id);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect(
    "uses one shared manual price across accounts and marks missing prices incomplete",
    () =>
      Effect.gen(function* () {
        const asset = yield* Finance.createAsset({
          assetCategory: "other",
          name: "Private company",
          identifiers: [],
        });
        const first = yield* Finance.createAccount({
          name: "Default",
        });
        const second = yield* Finance.createAccount({
          name: "Default",
        });
        yield* Finance.createPosition({ accountId: first.id, assetId: asset.id, quantity: "2" });
        const beforePrice = yield* Finance.createPosition({
          accountId: second.id,
          assetId: asset.id,
          quantity: "3",
        });
        yield* Finance.setManualPrice(asset.id, { price: "10", currencyAssetId: "fiat:USD" });
        const pricedFirst = yield* Finance.getAccount(first.id);
        const pricedSecond = yield* Finance.getAccount(second.id);
        expect(beforePrice.totalIncomplete).toBe(true);
        expect(pricedFirst.total).toBe("20");
        expect(pricedSecond.total).toBe("30");
        expect(pricedFirst.positions[0]?.price?.price).toBe("10");
        expect(pricedSecond.positions[0]?.price?.price).toBe("10");
      }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("maintains name, symbol, and optional manual price atomically", () =>
    Effect.gen(function* () {
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Private company",
        identifiers: [],
      });
      const updated = yield* Finance.maintainAsset(asset.id, {
        name: "Studio",
        symbol: "STUDIO",
        manualPrice: { price: "25", currencyAssetId: "fiat:USD" },
      });
      expect(updated.name).toBe("Studio");
      expect(updated.symbol).toBe("STUDIO");
      expect(updated.price?.price).toBe("25");
      expect(updated.price?.currencyAssetId).toBe("fiat:USD");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects invalid maintenance before persistence and reports missing assets", () =>
    Effect.gen(function* () {
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Keep me",
        identifiers: [],
      });
      const emptyName = yield* Finance.maintainAsset(asset.id, { name: "   " }).pipe(Effect.flip);
      const infinitePrice = yield* Finance.maintainAsset(asset.id, {
        name: "Changed",
        manualPrice: { price: "Infinity", currencyAssetId: "fiat:USD" },
      }).pipe(Effect.flip);
      const missing = yield* Finance.maintainAsset("missing-asset", { name: "Ghost" }).pipe(
        Effect.flip,
      );
      const listed = yield* Finance.createAsset({
        assetCategory: "stocks_etfs",
        name: "Apple",
        identifiers: [],
      });
      const automatic = yield* Finance.maintainAsset(listed.id, { name: "Renamed" }).pipe(
        Effect.flip,
      );
      const unchanged = yield* Finance.getAsset(asset.id);
      expect(emptyName.code).toBe("validation");
      expect(infinitePrice.code).toBe("validation");
      expect(missing.code).toBe("not_found");
      expect(automatic.code).toBe("read_only");
      expect(unchanged.name).toBe("Keep me");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rolls back when either maintenance persistence step fails", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Original",
        identifiers: [],
      });
      yield* sql`CREATE TRIGGER fail_asset_update AFTER UPDATE ON assets
        BEGIN SELECT RAISE(ABORT, 'asset persist failed'); END`;
      const metadataFailure = yield* Finance.maintainAsset(asset.id, {
        name: "Metadata fail",
        manualPrice: { price: "10", currencyAssetId: "fiat:USD" },
      }).pipe(Effect.flip);
      const afterMetadataFailure = yield* Finance.getAsset(asset.id);
      yield* sql`DROP TRIGGER fail_asset_update`;
      yield* sql`CREATE TRIGGER fail_price_insert AFTER INSERT ON asset_prices
        BEGIN SELECT RAISE(ABORT, 'price persist failed'); END`;
      const priceFailure = yield* Finance.maintainAsset(asset.id, {
        name: "Price fail",
        manualPrice: { price: "12", currencyAssetId: "fiat:USD" },
      }).pipe(Effect.flip);
      const afterPriceFailure = yield* Finance.getAsset(asset.id);
      expect(metadataFailure.code).toBe("database");
      expect(priceFailure.code).toBe("database");
      expect(afterMetadataFailure.name).toBe("Original");
      expect(afterMetadataFailure.price).toBeNull();
      expect(afterPriceFailure.name).toBe("Original");
      expect(afterPriceFailure.price).toBeNull();
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
