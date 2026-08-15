import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/**
 * Replaces Asset class, Account kind, and Custodians with Asset categories
 * and optionally connected Accounts. Pre-production: existing user rows
 * are discarded; seeded cash currencies are recategorized in place.
 */
export const unifyPortfolioDomainModel = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`DROP TRIGGER IF EXISTS custodians_management_mode_immutable`;
  yield* sql`DROP TRIGGER IF EXISTS custodian_connectors_synced_only`;
  yield* sql`DROP TRIGGER IF EXISTS accounts_validate_insert`;
  yield* sql`DROP TRIGGER IF EXISTS accounts_validate_update`;
  yield* sql`DROP TRIGGER IF EXISTS asset_prices_currency_is_fiat_insert`;
  yield* sql`DROP TRIGGER IF EXISTS asset_prices_currency_is_fiat_update`;
  yield* sql`DROP TRIGGER IF EXISTS custodians_presentation_role_immutable`;
  yield* sql`DROP TRIGGER IF EXISTS accounts_presentation_role_immutable`;
  yield* sql`DROP TRIGGER IF EXISTS custodians_system_role_manual_insert`;
  yield* sql`DROP TRIGGER IF EXISTS custodians_system_role_manual_update`;

  yield* sql`DROP TABLE IF EXISTS position_snapshots`;
  yield* sql`DROP TABLE IF EXISTS positions`;
  yield* sql`DROP TABLE IF EXISTS connector_asset_mappings`;
  yield* sql`DROP TABLE IF EXISTS accounts`;
  yield* sql`DROP TABLE IF EXISTS custodian_connectors`;
  yield* sql`DROP TABLE IF EXISTS custodians`;
  yield* sql`DELETE FROM asset_price_snapshots`;
  yield* sql`DELETE FROM snapshots`;
  yield* sql`DELETE FROM asset_prices WHERE asset_id NOT LIKE 'fiat:%'`;
  yield* sql`DELETE FROM asset_identifiers WHERE asset_id NOT LIKE 'fiat:%'`;
  yield* sql`DELETE FROM assets WHERE id NOT LIKE 'fiat:%'`;

  yield* sql`ALTER TABLE assets ADD COLUMN asset_category TEXT NOT NULL DEFAULT 'cash'
    CHECK (asset_category IN ('stocks_etfs', 'bonds', 'crypto', 'cash', 'derivatives', 'commodities', 'other'))`;
  yield* sql`ALTER TABLE assets DROP COLUMN asset_class`;

  yield* sql`CREATE TABLE connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    connector_id TEXT NOT NULL,
    config_json TEXT NOT NULL CHECK (json_valid(config_json)),
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    connection_id TEXT REFERENCES connections(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    base_currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    connector_account_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;
  yield* sql`CREATE UNIQUE INDEX accounts_connector_identity
    ON accounts(connection_id, connector_account_id)
    WHERE connector_account_id IS NOT NULL`;

  yield* sql`CREATE TABLE connector_asset_mappings (
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    external_asset_id TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    PRIMARY KEY(connection_id, external_asset_id)
  ) STRICT`;

  yield* sql`CREATE TABLE positions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    quantity REAL NOT NULL CHECK (
      quantity >= -1.7976931348623157e308 AND quantity <= 1.7976931348623157e308
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(account_id, asset_id)
  ) STRICT`;

  yield* sql`CREATE TABLE position_snapshots (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    quantity REAL NOT NULL CHECK (
      quantity >= -1.7976931348623157e308 AND quantity <= 1.7976931348623157e308
    ),
    PRIMARY KEY(snapshot_id, position_id)
  ) STRICT`;

  yield* sql`CREATE TRIGGER accounts_validate_insert
    BEFORE INSERT ON accounts
    BEGIN
      SELECT CASE
        WHEN (SELECT asset_category FROM assets WHERE id = NEW.base_currency_asset_id) <> 'cash'
          THEN RAISE(ABORT, 'account base currency must be cash')
        WHEN NEW.connection_id IS NULL AND NEW.connector_account_id IS NOT NULL
          THEN RAISE(ABORT, 'manual account cannot have connector identity')
        WHEN NEW.connection_id IS NOT NULL AND NEW.connector_account_id IS NULL
          THEN RAISE(ABORT, 'connected account requires connector identity')
      END;
    END`;
  yield* sql`CREATE TRIGGER accounts_validate_update
    BEFORE UPDATE OF connection_id, base_currency_asset_id, connector_account_id ON accounts
    BEGIN
      SELECT CASE
        WHEN (SELECT asset_category FROM assets WHERE id = NEW.base_currency_asset_id) <> 'cash'
          THEN RAISE(ABORT, 'account base currency must be cash')
        WHEN NEW.connection_id IS NULL AND NEW.connector_account_id IS NOT NULL
          THEN RAISE(ABORT, 'manual account cannot have connector identity')
        WHEN NEW.connection_id IS NOT NULL AND NEW.connector_account_id IS NULL
          THEN RAISE(ABORT, 'connected account requires connector identity')
      END;
    END`;
  yield* sql`CREATE TRIGGER asset_prices_currency_is_cash_insert
    BEFORE INSERT ON asset_prices
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'price currency must be cash');
    END`;
  yield* sql`CREATE TRIGGER asset_prices_currency_is_cash_update
    BEFORE UPDATE OF currency_asset_id ON asset_prices
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'price currency must be cash');
    END`;
});
