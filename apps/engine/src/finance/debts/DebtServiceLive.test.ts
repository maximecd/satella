import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("debts", () => {
  it.effect("creates, lists, edits, and deletes a manual debt", () =>
    Effect.gen(function* () {
      const created = yield* Finance.createDebt({
        name: "Income tax",
        kind: "tax",
        amount: "4000",
        currencyAssetId: "fiat:EUR",
        dueDate: "2026-09-15",
      });
      expect(created.name).toBe("Income tax");
      expect(created.kind).toBe("tax");
      expect(created.amount).toBe("4000");
      expect(created.currencyIso).toBe("EUR");
      expect(created.dueDate).toBe("2026-09-15");
      const updated = yield* Finance.updateDebt(created.id, {
        amount: "1500.50",
        dueDate: null,
      });
      expect(updated.amount).toBe("1500.5");
      expect(updated.dueDate).toBe(null);
      expect(updated.kind).toBe("tax");
      const listed = yield* Finance.listDebts();
      expect(listed.map(({ id }) => id)).toEqual([created.id]);
      yield* Finance.deleteDebt(created.id);
      const missing = yield* Finance.getDebt(created.id).pipe(Effect.flip);
      expect(missing.code).toBe("not_found");
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
          Finance.createDebt({
            name: "   ",
            kind: "other",
            amount: "10",
            currencyAssetId: "fiat:USD",
          }),
          Finance.createDebt({
            name: "Loan",
            kind: "loan",
            amount: "0",
            currencyAssetId: "fiat:USD",
          }),
          Finance.createDebt({
            name: "Loan",
            kind: "loan",
            amount: "10",
            currencyAssetId: apple.id,
          }),
          Finance.createDebt({
            name: "Loan",
            kind: "loan",
            amount: "10",
            currencyAssetId: "fiat:USD",
            dueDate: "September",
          }),
        ].map((effect) => Effect.result(effect)),
      );
      expect(failures.map((outcome) => outcome._tag)).toEqual([
        "Failure",
        "Failure",
        "Failure",
        "Failure",
      ]);
      expect(yield* Finance.listDebts()).toEqual([]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
