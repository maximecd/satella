import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/**
 * Target finance schema. Pre-production history is discarded; this is the
 * single initial migration. Business rules (cash-account constraints, synced
 * read-only, other-asset placement) are validated in the engine, not here.
 */
export const initialFinanceModel = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    asset_category TEXT NOT NULL CHECK (asset_category IN ('stocks_etfs', 'crypto', 'cash', 'other')),
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

  yield* sql`CREATE TABLE custodians (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    connector_id TEXT,
    config_json TEXT CHECK (config_json IS NULL OR json_valid(config_json)),
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (connector_id IS NULL AND config_json IS NULL)
      OR (connector_id IS NOT NULL AND config_json IS NOT NULL)
    )
  ) STRICT`;

  yield* sql`CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    custodian_id TEXT NOT NULL REFERENCES custodians(id),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    account_type TEXT NOT NULL CHECK (
      account_type IN ('checking', 'savings', 'brokerage', 'crypto_wallet', 'other')
    ),
    base_currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    connector_account_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;
  yield* sql`CREATE UNIQUE INDEX accounts_connector_identity
    ON accounts(custodian_id, connector_account_id)
    WHERE connector_account_id IS NOT NULL`;

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
    quantity TEXT NOT NULL CHECK (length(trim(quantity)) > 0),
    manual_average_unit_purchase_price TEXT CHECK (
      manual_average_unit_purchase_price IS NULL OR length(trim(manual_average_unit_purchase_price)) > 0
    ),
    manual_purchase_currency_asset_id TEXT REFERENCES assets(id),
    synced_average_unit_purchase_price TEXT CHECK (
      synced_average_unit_purchase_price IS NULL OR length(trim(synced_average_unit_purchase_price)) > 0
    ),
    synced_purchase_currency_asset_id TEXT REFERENCES assets(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (manual_average_unit_purchase_price IS NULL AND manual_purchase_currency_asset_id IS NULL)
      OR (manual_average_unit_purchase_price IS NOT NULL AND manual_purchase_currency_asset_id IS NOT NULL)
    ),
    CHECK (
      (synced_average_unit_purchase_price IS NULL AND synced_purchase_currency_asset_id IS NULL)
      OR (synced_average_unit_purchase_price IS NOT NULL AND synced_purchase_currency_asset_id IS NOT NULL)
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
    reporting_currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    app_language TEXT NOT NULL CHECK (app_language IN ('en', 'fr'))
  ) STRICT`;

  yield* sql`CREATE TABLE vault_security (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    screen_lock_timeout_minutes INTEGER NOT NULL CHECK (screen_lock_timeout_minutes IN (5, 15, 30, 60)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
  yield* sql`INSERT INTO app_settings (id, reporting_currency_asset_id, app_language)
    VALUES (1, 'fiat:USD', 'en')`;

  yield* sql`INSERT INTO custodians (id, name, connector_id, config_json, created_at, updated_at)
    VALUES ('custodian:manual', 'Manual custodian', NULL, NULL, ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO accounts
    (id, custodian_id, name, account_type, base_currency_asset_id, connector_account_id, created_at, updated_at)
    VALUES ('account:manual', 'custodian:manual', 'Manual account', 'other', 'fiat:USD', NULL, ${timestamp}, ${timestamp})`;

  yield* sql`CREATE TRIGGER accounts_validate_insert
    BEFORE INSERT ON accounts
    BEGIN
      SELECT CASE
        WHEN (SELECT asset_category FROM assets WHERE id = NEW.base_currency_asset_id) <> 'cash'
          THEN RAISE(ABORT, 'account base currency must be cash')
        WHEN (SELECT connector_id FROM custodians WHERE id = NEW.custodian_id) IS NULL
          AND NEW.connector_account_id IS NOT NULL
          THEN RAISE(ABORT, 'manual account cannot have connector identity')
        WHEN (SELECT connector_id FROM custodians WHERE id = NEW.custodian_id) IS NOT NULL
          AND NEW.connector_account_id IS NULL
          THEN RAISE(ABORT, 'synced account requires connector identity')
      END;
    END`;
  yield* sql`CREATE TRIGGER accounts_validate_update
    BEFORE UPDATE OF custodian_id, base_currency_asset_id, connector_account_id ON accounts
    BEGIN
      SELECT CASE
        WHEN (SELECT asset_category FROM assets WHERE id = NEW.base_currency_asset_id) <> 'cash'
          THEN RAISE(ABORT, 'account base currency must be cash')
        WHEN (SELECT connector_id FROM custodians WHERE id = NEW.custodian_id) IS NULL
          AND NEW.connector_account_id IS NOT NULL
          THEN RAISE(ABORT, 'manual account cannot have connector identity')
        WHEN (SELECT connector_id FROM custodians WHERE id = NEW.custodian_id) IS NOT NULL
          AND NEW.connector_account_id IS NULL
          THEN RAISE(ABORT, 'synced account requires connector identity')
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
      OR (NEW.synced_purchase_currency_asset_id IS NOT NULL AND
      (SELECT asset_category FROM assets WHERE id = NEW.synced_purchase_currency_asset_id) <> 'cash')
    BEGIN
      SELECT RAISE(ABORT, 'purchase price currency must be cash');
    END`;
  yield* sql`CREATE TRIGGER positions_purchase_currency_is_cash_update
    BEFORE UPDATE OF manual_purchase_currency_asset_id, synced_purchase_currency_asset_id ON positions
    WHEN (NEW.manual_purchase_currency_asset_id IS NOT NULL AND
      (SELECT asset_category FROM assets WHERE id = NEW.manual_purchase_currency_asset_id) <> 'cash')
      OR (NEW.synced_purchase_currency_asset_id IS NOT NULL AND
      (SELECT asset_category FROM assets WHERE id = NEW.synced_purchase_currency_asset_id) <> 'cash')
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
