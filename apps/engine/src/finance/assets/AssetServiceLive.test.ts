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
        yield* Finance.createPosition({ accountId: first.id, assetId: asset.id, quantity: 2 });
        const beforePrice = yield* Finance.createPosition({
          accountId: second.id,
          assetId: asset.id,
          quantity: 3,
        });
        yield* Finance.setManualPrice(asset.id, { price: 10, currencyAssetId: "fiat:USD" });
        const pricedFirst = yield* Finance.getAccount(first.id);
        const pricedSecond = yield* Finance.getAccount(second.id);
        expect(beforePrice.totalIncomplete).toBe(true);
        expect(pricedFirst.total).toBeCloseTo(20);
        expect(pricedSecond.total).toBeCloseTo(30);
        expect(pricedFirst.positions[0]?.price?.price).toBe(10);
        expect(pricedSecond.positions[0]?.price?.price).toBe(10);
      }).pipe(Effect.provide(engineTestLayer())),
  );
});
