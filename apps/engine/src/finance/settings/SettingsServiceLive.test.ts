import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("settings", () => {
  it.effect("defaults Reporting currency to USD and persists a supported Cash currency", () =>
    Effect.gen(function* () {
      const initial = yield* Finance.getSettings();
      expect(initial.reportingCurrencyAssetId).toBe("fiat:USD");
      expect(initial.reportingCurrencyIso).toBe("USD");
      expect(initial.currencies.map(({ iso }) => iso)).toEqual([
        "AUD",
        "CAD",
        "CHF",
        "CNH",
        "EUR",
        "GBP",
        "HKD",
        "JPY",
        "NZD",
        "USD",
      ]);

      const updated = yield* Finance.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
      expect(updated.reportingCurrencyAssetId).toBe("fiat:EUR");
      expect(updated.reportingCurrencyIso).toBe("EUR");
      expect((yield* Finance.getSettings()).reportingCurrencyIso).toBe("EUR");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects a Reporting currency that is not a seeded Cash currency", () =>
    Effect.gen(function* () {
      const custom = yield* Finance.createAsset({
        assetCategory: "cash",
        name: "Points",
        identifiers: [],
      });
      const rejected = yield* Finance.updateSettings({
        reportingCurrencyAssetId: custom.id,
      }).pipe(Effect.flip);
      expect(rejected.message).toContain("supported Cash currency");
      expect((yield* Finance.getSettings()).reportingCurrencyIso).toBe("USD");
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
