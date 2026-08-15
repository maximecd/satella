import * as Effect from "effect/Effect";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { engineTestLayer } from "../../database/database.test-utils.js";
import * as Finance from "../finance.test-utils.js";

describe("accounts", () => {
  it.effect("renames a manual account and deletes it after its positions are gone", () =>
    Effect.gen(function* () {
      const account = yield* Finance.createAccount({
        name: "Checking",
        baseCurrencyAssetId: "fiat:EUR",
      });
      const withBalance = yield* Finance.createPosition({
        accountId: account.id,
        assetId: "fiat:EUR",
        quantity: 10,
      });
      const renamed = yield* Finance.updateAccount(account.id, {
        name: "Everyday",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.deletePosition(withBalance.positions[0]!.id);
      yield* Finance.deleteAccount(account.id);
      const remaining = yield* Finance.getAccount(account.id).pipe(Effect.flip);
      expect(renamed.name).toBe("Everyday");
      expect(renamed.baseCurrencyIso).toBe("EUR");
      expect(remaining.message).toContain("was not found");
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
