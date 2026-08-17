import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/**
 * Resets the pre-production finance tables around exact decimal text values
 * and authoritative Position purchase prices. Vault security is intentionally
 * left intact because it is not part of the finance domain reset.
 */
export const addDecimalValuesAndPurchasePrices = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`DROP TRIGGER IF EXISTS app_settings_reporting_currency_is_cash_insert`;
  yield* sql`DROP TRIGGER IF EXISTS app_settings_reporting_currency_is_cash_update`;
  yield* sql`DROP TRIGGER IF EXISTS accounts_validate_insert`;
  yield* sql`DROP TRIGGER IF EXISTS accounts_validate_update`;
  yield* sql`DROP TRIGGER IF EXISTS asset_prices_currency_is_cash_insert`;
  yield* sql`DROP TRIGGER IF EXISTS asset_prices_currency_is_cash_update`;
  yield* sql`DROP TRIGGER IF EXISTS positions_purchase_currency_is_cash_insert`;
  yield* sql`DROP TRIGGER IF EXISTS positions_purchase_currency_is_cash_update`;

  yield* sql`DROP TABLE IF EXISTS app_settings`;
  yield* sql`DROP TABLE IF EXISTS asset_price_snapshots`;
  yield* sql`DROP TABLE IF EXISTS position_snapshots`;
  yield* sql`DROP TABLE IF EXISTS snapshots`;
  yield* sql`DROP TABLE IF EXISTS positions`;
  yield* sql`DROP TABLE IF EXISTS connector_asset_mappings`;
  yield* sql`DROP TABLE IF EXISTS accounts`;
  yield* sql`DROP TABLE IF EXISTS connections`;
  yield* sql`DROP TABLE IF EXISTS asset_prices`;
  yield* sql`DROP TABLE IF EXISTS asset_identifiers`;
  yield* sql`DROP TABLE IF EXISTS assets`;

  yield* sql`CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    asset_category TEXT NOT NULL CHECK (asset_category IN ('stocks_etfs', 'bonds', 'crypto', 'cash', 'other')),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    symbol TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`CREATE TABLE asset_identifiers (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    identifier_type TEXT NOT NULL CHECK (length(trim(identifier_type)) > 0),
    identifier_value TEXT NOT NULL CHECK (length(trim(identifier_value)) > 0),
    UNIQUE(identifier_type, identifier_value)
  ) STRICT`;
  yield* sql`CREATE INDEX asset_identifiers_asset_id ON asset_identifiers(asset_id)`;

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
    quantity TEXT NOT NULL CHECK (length(trim(quantity)) > 0),
    manual_average_unit_purchase_price TEXT CHECK (
      manual_average_unit_purchase_price IS NULL OR length(trim(manual_average_unit_purchase_price)) > 0
    ),
    manual_purchase_currency_asset_id TEXT REFERENCES assets(id),
    connection_average_unit_purchase_price TEXT CHECK (
      connection_average_unit_purchase_price IS NULL OR length(trim(connection_average_unit_purchase_price)) > 0
    ),
    connection_purchase_currency_asset_id TEXT REFERENCES assets(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (manual_average_unit_purchase_price IS NULL AND manual_purchase_currency_asset_id IS NULL)
      OR (manual_average_unit_purchase_price IS NOT NULL AND manual_purchase_currency_asset_id IS NOT NULL)
    ),
    CHECK (
      (connection_average_unit_purchase_price IS NULL AND connection_purchase_currency_asset_id IS NULL)
      OR (connection_average_unit_purchase_price IS NOT NULL AND connection_purchase_currency_asset_id IS NOT NULL)
    ),
    UNIQUE(account_id, asset_id)
  ) STRICT`;

  yield* sql`CREATE TABLE asset_prices (
    asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    price TEXT NOT NULL CHECK (length(trim(price)) > 0),
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
    quantity TEXT NOT NULL CHECK (length(trim(quantity)) > 0),
    PRIMARY KEY(snapshot_id, position_id)
  ) STRICT`;
  yield* sql`CREATE TABLE asset_price_snapshots (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    price TEXT NOT NULL CHECK (length(trim(price)) > 0),
    currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    source TEXT NOT NULL CHECK (length(trim(source)) > 0),
    observed_at TEXT NOT NULL,
    PRIMARY KEY(snapshot_id, asset_id)
  ) STRICT`;

  yield* sql`CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    reporting_currency_asset_id TEXT NOT NULL REFERENCES assets(id)
  ) STRICT`;

  const timestamp = "1970-01-01T00:00:00.000Z";
  const currencies = [
    ["USD", "US dollar"],
    ["EUR", "Euro"],
    ["JPY", "Japanese yen"],
    ["GBP", "Pound sterling"],
    ["AUD", "Australian dollar"],
    ["CAD", "Canadian dollar"],
    ["CHF", "Swiss franc"],
    ["CNH", "Chinese renminbi"],
    ["HKD", "Hong Kong dollar"],
    ["NZD", "New Zealand dollar"],
  ] as const;
  for (const [iso, name] of currencies) {
    const assetId = `fiat:${iso}`;
    yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
      VALUES (${assetId}, 'cash', ${name}, ${iso}, ${timestamp}, ${timestamp})`;
    yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
      VALUES (${`identifier:iso:${iso}`}, ${assetId}, 'iso_currency', ${iso})`;
  }
  yield* sql`INSERT INTO app_settings (id, reporting_currency_asset_id) VALUES (1, 'fiat:USD')`;

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
  yield* sql`CREATE TRIGGER positions_purchase_currency_is_cash_insert
    BEFORE INSERT ON positions
    WHEN (NEW.manual_purchase_currency_asset_id IS NOT NULL AND
      (SELECT asset_category FROM assets WHERE id = NEW.manual_purchase_currency_asset_id) <> 'cash')
      OR (NEW.connection_purchase_currency_asset_id IS NOT NULL AND
      (SELECT asset_category FROM assets WHERE id = NEW.connection_purchase_currency_asset_id) <> 'cash')
    BEGIN
      SELECT RAISE(ABORT, 'purchase price currency must be cash');
    END`;
  yield* sql`CREATE TRIGGER positions_purchase_currency_is_cash_update
    BEFORE UPDATE OF manual_purchase_currency_asset_id, connection_purchase_currency_asset_id ON positions
    WHEN (NEW.manual_purchase_currency_asset_id IS NOT NULL AND
      (SELECT asset_category FROM assets WHERE id = NEW.manual_purchase_currency_asset_id) <> 'cash')
      OR (NEW.connection_purchase_currency_asset_id IS NOT NULL AND
      (SELECT asset_category FROM assets WHERE id = NEW.connection_purchase_currency_asset_id) <> 'cash')
    BEGIN
      SELECT RAISE(ABORT, 'purchase price currency must be cash');
    END`;
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
