import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * The first domain migration. Tables are STRICT and deliberately keep money and
 * quantities as REAL values; service validation and the CHECK constraints reject
 * non-finite values before they can become persisted domain state.
 */
export const initialFinanceModel = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    asset_class TEXT NOT NULL CHECK (asset_class IN ('fiat', 'security', 'crypto', 'custom')),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    symbol TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`CREATE TABLE custodians (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    management_mode TEXT NOT NULL CHECK (management_mode IN ('manual', 'synced')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`CREATE TABLE custodian_connectors (
    custodian_id TEXT PRIMARY KEY REFERENCES custodians(id) ON DELETE CASCADE,
    connector_id TEXT NOT NULL,
    config_json TEXT NOT NULL CHECK (json_valid(config_json)),
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    custodian_id TEXT NOT NULL REFERENCES custodians(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    base_currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    connector_account_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;
  yield* sql`CREATE UNIQUE INDEX accounts_connector_identity
    ON accounts(custodian_id, connector_account_id)
    WHERE connector_account_id IS NOT NULL`;

  yield* sql`CREATE TABLE asset_identifiers (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    identifier_type TEXT NOT NULL CHECK (length(trim(identifier_type)) > 0),
    identifier_value TEXT NOT NULL CHECK (length(trim(identifier_value)) > 0),
    UNIQUE(identifier_type, identifier_value)
  ) STRICT`;

  yield* sql`CREATE INDEX asset_identifiers_asset_id ON asset_identifiers(asset_id)`;

  yield* sql`CREATE TABLE connector_asset_mappings (
    custodian_id TEXT NOT NULL REFERENCES custodians(id) ON DELETE CASCADE,
    external_asset_id TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    PRIMARY KEY(custodian_id, external_asset_id)
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

  yield* sql`CREATE TABLE asset_prices (
    asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    price REAL NOT NULL CHECK (
      price >= -1.7976931348623157e308 AND price <= 1.7976931348623157e308
    ),
    currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    source TEXT NOT NULL CHECK (length(trim(source)) > 0),
    observed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`CREATE TABLE snapshots (
    id TEXT PRIMARY KEY,
    captured_at TEXT NOT NULL UNIQUE
  ) STRICT`;

  yield* sql`CREATE TABLE position_snapshots (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    quantity REAL NOT NULL CHECK (
      quantity >= -1.7976931348623157e308 AND quantity <= 1.7976931348623157e308
    ),
    PRIMARY KEY(snapshot_id, position_id)
  ) STRICT`;

  yield* sql`CREATE TABLE asset_price_snapshots (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    price REAL NOT NULL CHECK (
      price >= -1.7976931348623157e308 AND price <= 1.7976931348623157e308
    ),
    currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    source TEXT NOT NULL CHECK (length(trim(source)) > 0),
    observed_at TEXT NOT NULL,
    PRIMARY KEY(snapshot_id, asset_id)
  ) STRICT`;

  yield* sql`CREATE TRIGGER custodians_management_mode_immutable
    BEFORE UPDATE OF management_mode ON custodians
    WHEN NEW.management_mode <> OLD.management_mode
    BEGIN
      SELECT RAISE(ABORT, 'custodian management_mode is immutable');
    END`;

  yield* sql`CREATE TRIGGER custodian_connectors_synced_only
    BEFORE INSERT ON custodian_connectors
    WHEN (SELECT management_mode FROM custodians WHERE id = NEW.custodian_id) <> 'synced'
    BEGIN
      SELECT RAISE(ABORT, 'manual custodian cannot have a connector');
    END`;

  yield* sql`CREATE TRIGGER accounts_validate_insert
    BEFORE INSERT ON accounts
    BEGIN
      SELECT CASE
        WHEN (SELECT asset_class FROM assets WHERE id = NEW.base_currency_asset_id) <> 'fiat'
          THEN RAISE(ABORT, 'account base currency must be fiat')
        WHEN (SELECT management_mode FROM custodians WHERE id = NEW.custodian_id) = 'manual'
          AND NEW.connector_account_id IS NOT NULL
          THEN RAISE(ABORT, 'manual account cannot have connector identity')
        WHEN (SELECT management_mode FROM custodians WHERE id = NEW.custodian_id) = 'synced'
          AND NEW.connector_account_id IS NULL
          THEN RAISE(ABORT, 'synced account requires connector identity')
      END;
    END`;

  yield* sql`CREATE TRIGGER accounts_validate_update
    BEFORE UPDATE OF custodian_id, base_currency_asset_id, connector_account_id ON accounts
    BEGIN
      SELECT CASE
        WHEN (SELECT asset_class FROM assets WHERE id = NEW.base_currency_asset_id) <> 'fiat'
          THEN RAISE(ABORT, 'account base currency must be fiat')
        WHEN (SELECT management_mode FROM custodians WHERE id = NEW.custodian_id) = 'manual'
          AND NEW.connector_account_id IS NOT NULL
          THEN RAISE(ABORT, 'manual account cannot have connector identity')
        WHEN (SELECT management_mode FROM custodians WHERE id = NEW.custodian_id) = 'synced'
          AND NEW.connector_account_id IS NULL
          THEN RAISE(ABORT, 'synced account requires connector identity')
      END;
    END`;

  yield* sql`CREATE TRIGGER asset_prices_currency_is_fiat_insert
    BEFORE INSERT ON asset_prices
    WHEN (SELECT asset_class FROM assets WHERE id = NEW.currency_asset_id) <> 'fiat'
    BEGIN
      SELECT RAISE(ABORT, 'price currency must be fiat');
    END`;

  yield* sql`CREATE TRIGGER asset_prices_currency_is_fiat_update
    BEFORE UPDATE OF currency_asset_id ON asset_prices
    WHEN (SELECT asset_class FROM assets WHERE id = NEW.currency_asset_id) <> 'fiat'
    BEGIN
      SELECT RAISE(ABORT, 'price currency must be fiat');
    END`;

  const timestamp = "1970-01-01T00:00:00.000Z";
  yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
    VALUES ('fiat:USD', 'fiat', 'US Dollar', 'USD', ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
    VALUES ('identifier:iso:USD', 'fiat:USD', 'iso_currency', 'USD')`;
});
