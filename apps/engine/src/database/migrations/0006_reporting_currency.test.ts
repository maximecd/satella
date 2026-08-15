import * as Effect from "effect/Effect";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import { engineTestLayer } from "../database.test-utils.js";

describe("reporting currency settings", () => {
  it.effect(
    "defaults Reporting currency to USD and still allows multiple snapshots on one day",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const settings = yield* sql<{
          readonly reporting_currency_asset_id: string;
        }>`SELECT reporting_currency_asset_id FROM app_settings WHERE id = 1`;
        const timestamp = "2026-08-11T00:00:00.000Z";
        yield* sql`INSERT INTO assets
        (id, asset_category, name, symbol, created_at, updated_at)
        VALUES ('sec-1', 'stocks_etfs', 'Apple', 'AAPL', ${timestamp}, ${timestamp})`;
        const nonCash = yield* sql`
        UPDATE app_settings SET reporting_currency_asset_id = 'sec-1' WHERE id = 1`.pipe(
          Effect.flip,
        );
        yield* sql`INSERT INTO snapshots (id, captured_at) VALUES ('snap-1', ${timestamp})`;
        yield* sql`INSERT INTO snapshots (id, captured_at)
        VALUES ('snap-2', '2026-08-11T12:00:00.000Z')`;
        const snapshots = yield* sql<{ readonly id: string }>`SELECT id FROM snapshots ORDER BY id`;

        expect(settings).toEqual([{ reporting_currency_asset_id: "fiat:USD" }]);
        expect(nonCash).toBeDefined();
        expect(snapshots).toEqual([{ id: "snap-1" }, { id: "snap-2" }]);
      }).pipe(Effect.provide(engineTestLayer())),
  );
});
