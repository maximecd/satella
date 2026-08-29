import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

const quoteUsd = (
  sql: SqlClient.SqlClient,
  assetId: string,
  price: string,
  at = "2026-08-11T00:00:00.000Z",
) =>
  sql`INSERT INTO asset_prices (asset_id, price, currency_asset_id, source, observed_at, updated_at)
    VALUES (${assetId}, ${price}, 'fiat:USD', 'test', ${at}, ${at})
    ON CONFLICT(asset_id) DO UPDATE SET price = excluded.price,
      currency_asset_id = excluded.currency_asset_id, source = excluded.source,
      observed_at = excluded.observed_at, updated_at = excluded.updated_at`;

describe("goals", () => {
  it.effect("creates, lists, edits, and deletes a Goal", () =>
    Effect.gen(function* () {
      const created = yield* Finance.createGoal({
        name: "Buy a car",
        amount: "15000",
        currencyAssetId: "fiat:EUR",
        targetDate: "2026-09-15",
        accountIds: [],
      });
      expect(created.name).toBe("Buy a car");
      expect(created.amount).toBe("15000");
      expect(created.currencyIso).toBe("EUR");
      expect(created.targetDate).toBe("2026-09-15");
      expect(created.currentAmount).toBe("0");
      expect(created.contributingAccounts).toEqual([]);
      const updated = yield* Finance.updateGoal(created.id, {
        amount: "12000.50",
        targetDate: null,
      });
      expect(updated.amount).toBe("12000.5");
      expect(updated.targetDate).toBe(null);
      const listed = yield* Finance.listGoals();
      expect(listed.map(({ id }) => id)).toEqual([created.id]);
      yield* Finance.deleteGoal(created.id);
      const missing = yield* Finance.getGoal(created.id).pipe(Effect.flip);
      expect(missing.code).toBe("not_found");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("sums contributing Account totals in the Goal currency", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* quoteUsd(sql, "fiat:EUR", "1.1");
      const livret = yield* Finance.createAccount({
        name: "Livret A",
        accountType: "savings",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createPosition({
        accountId: livret.id,
        assetId: "fiat:EUR",
        quantity: "8000",
      });
      const checking = yield* Finance.createAccount({
        name: "Checking",
        accountType: "checking",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createPosition({
        accountId: checking.id,
        assetId: "fiat:EUR",
        quantity: "2000",
      });
      const eurGoal = yield* Finance.createGoal({
        name: "Buy a car",
        amount: "15000",
        currencyAssetId: "fiat:EUR",
        accountIds: [livret.id, checking.id],
      });
      expect(eurGoal.currentAmount).toBe("10000");
      expect(eurGoal.contributingAccounts.map(({ name }) => name)).toEqual([
        "Checking",
        "Livret A",
      ]);
      const usdGoal = yield* Finance.updateGoal(eurGoal.id, { currencyAssetId: "fiat:USD" });
      expect(usdGoal.amount).toBe("15000");
      expect(usdGoal.currencyIso).toBe("USD");
      expect(usdGoal.currentAmount).toBe("11000");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("refuses an Account that already contributes to another Goal", () =>
    Effect.gen(function* () {
      const livret = yield* Finance.createAccount({
        name: "Livret A",
        accountType: "savings",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createGoal({
        name: "Car",
        amount: "15000",
        currencyAssetId: "fiat:EUR",
        accountIds: [livret.id],
      });
      const conflict = yield* Finance.createGoal({
        name: "Emergency fund",
        amount: "10000",
        currencyAssetId: "fiat:EUR",
        accountIds: [livret.id],
      }).pipe(Effect.flip);
      expect(conflict.code).toBe("validation");
      expect(conflict.message).toContain("at most one Goal");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("unlinks a deleted Account and keeps the Goal", () =>
    Effect.gen(function* () {
      const livret = yield* Finance.createAccount({
        name: "Livret A",
        accountType: "savings",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createPosition({
        accountId: livret.id,
        assetId: "fiat:EUR",
        quantity: "8000",
      });
      const checking = yield* Finance.createAccount({
        name: "Checking",
        accountType: "checking",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createPosition({
        accountId: checking.id,
        assetId: "fiat:EUR",
        quantity: "2000",
      });
      const goal = yield* Finance.createGoal({
        name: "Buy a car",
        amount: "15000",
        currencyAssetId: "fiat:EUR",
        accountIds: [livret.id, checking.id],
      });
      yield* Finance.deleteAccount(checking.id);
      const remaining = yield* Finance.getGoal(goal.id);
      expect(remaining.contributingAccounts.map(({ id }) => id)).toEqual([livret.id]);
      expect(remaining.currentAmount).toBe("8000");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects empty names, non-positive amounts, and non-cash currencies", () =>
    Effect.gen(function* () {
      const apple = yield* Finance.createAsset({
        assetCategory: "stocks_etfs",
        name: "Apple",
        symbol: "AAPL",
        identifiers: [],
      });
      const failures = yield* Effect.all(
        [
          Finance.createGoal({
            name: "   ",
            amount: "10",
            currencyAssetId: "fiat:USD",
            accountIds: [],
          }),
          Finance.createGoal({
            name: "Car",
            amount: "0",
            currencyAssetId: "fiat:USD",
            accountIds: [],
          }),
          Finance.createGoal({
            name: "Car",
            amount: "10",
            currencyAssetId: apple.id,
            accountIds: [],
          }),
          Finance.createGoal({
            name: "Car",
            amount: "10",
            currencyAssetId: "fiat:USD",
            targetDate: "September",
            accountIds: [],
          }),
        ].map((effect) => Effect.result(effect)),
      );
      expect(failures.map((outcome) => outcome._tag)).toEqual([
        "Failure",
        "Failure",
        "Failure",
        "Failure",
      ]);
      expect(yield* Finance.listGoals()).toEqual([]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
