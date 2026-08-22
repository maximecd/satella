import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("settings", () => {
  it.effect("defaults Reporting currency to USD and lists the supported cash currencies", () =>
    Effect.gen(function* () {
      const settings = yield* Finance.getSettings();
      expect(settings.reportingCurrency).toEqual({ assetId: "fiat:USD", iso: "USD" });
      expect(settings.language).toBe("en");
      expect(settings.currencies.map(({ iso }) => iso)).toEqual([
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
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("persists a supported Reporting currency without changing Account native totals", () =>
    Effect.gen(function* () {
      const account = yield* Finance.createAccount({
        name: "Livret A",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: "fiat:EUR",
        quantity: "100",
      });
      const updated = yield* Finance.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
      const native = yield* Finance.getAccount(account.id);
      const settings = yield* Finance.getSettings();
      expect(updated.reportingCurrency).toEqual({ assetId: "fiat:EUR", iso: "EUR" });
      expect(settings.reportingCurrency.iso).toBe("EUR");
      expect(native.baseCurrencyIso).toBe("EUR");
      expect(native.total).toBe("100");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("persists a supported App language and keeps it when omitted from a later update", () =>
    Effect.gen(function* () {
      const updated = yield* Finance.updateSettings({
        reportingCurrencyAssetId: "fiat:USD",
        language: "fr",
      });
      expect(updated.language).toBe("fr");
      yield* Finance.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
      const settings = yield* Finance.getSettings();
      expect(settings.language).toBe("fr");
      expect(settings.reportingCurrency.iso).toBe("EUR");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects a Reporting currency that is not a supported cash Asset", () =>
    Effect.gen(function* () {
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Art",
        identifiers: [],
      });
      const rejected = yield* Finance.updateSettings({
        reportingCurrencyAssetId: asset.id,
      }).pipe(Effect.flip);
      const missing = yield* Finance.updateSettings({
        reportingCurrencyAssetId: "missing",
      }).pipe(Effect.flip);
      const settings = yield* Finance.getSettings();
      expect(rejected.code).toBe("validation");
      expect(missing.code).toBe("not_found");
      expect(settings.reportingCurrency.iso).toBe("USD");
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
