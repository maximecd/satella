import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/**
 * Persists the Reporting-currency preference and enforces one Portfolio
 * snapshot per calendar day. Pre-production: no backfill of historical
 * same-day duplicates is required because snapshots were cleared in 0005.
 */
export const addSettingsAndDailySnapshots = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const timestamp = "1970-01-01T00:00:00.000Z";

  yield* sql`CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    reporting_currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    updated_at TEXT NOT NULL
  ) STRICT`;
  yield* sql`INSERT INTO app_settings (id, reporting_currency_asset_id, updated_at)
    VALUES (1, 'fiat:USD', ${timestamp})`;
  yield* sql`CREATE UNIQUE INDEX snapshots_one_per_calendar_day
    ON snapshots(date(captured_at))`;
});
