import * as Effect from "effect/Effect";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import { engineTestLayer } from "../database.test-utils.js";

describe("default currencies", () => {
  it.effect("seeds the ten supported fiat currencies", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const currencies = yield* sql<{ readonly symbol: string }>`SELECT symbol FROM assets
        WHERE asset_category = 'cash' ORDER BY symbol`;
      const accountColumns = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(accounts)`;
      expect(currencies.map(({ symbol }) => symbol)).toEqual([
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
      expect(accountColumns.map(({ name }) => name)).not.toContain("source_date");
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
