import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/** Persist a Reporting currency, defaulting to USD. */
export const addReportingCurrency = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    reporting_currency_asset_id TEXT NOT NULL REFERENCES assets(id)
  ) STRICT`;
  yield* sql`INSERT INTO app_settings (id, reporting_currency_asset_id) VALUES (1, 'fiat:USD')`;
  yield* sql`CREATE TRIGGER app_settings_reporting_currency_is_cash_insert
    BEFORE INSERT ON app_settings
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.reporting_currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'reporting currency must be cash');
    END`;
  yield* sql`CREATE TRIGGER app_settings_reporting_currency_is_cash_update
    BEFORE UPDATE OF reporting_currency_asset_id ON app_settings
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.reporting_currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'reporting currency must be cash');
    END`;
});
