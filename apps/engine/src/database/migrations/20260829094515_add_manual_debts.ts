import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/**
 * Manual debts become a first-class concept. One new table holds the debts
 * the user edits by hand, and every snapshot records the total outstanding
 * debt converted to the Reporting currency at capture time. Existing
 * snapshots keep a NULL total and read as zero debt.
 */
export const addManualDebts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE debts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    kind TEXT NOT NULL CHECK (kind IN ('tax', 'loan', 'other')),
    amount TEXT NOT NULL CHECK (length(trim(amount)) > 0),
    currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    due_date TEXT CHECK (
      due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`ALTER TABLE snapshots ADD COLUMN total_debt TEXT
    CHECK (total_debt IS NULL OR length(trim(total_debt)) > 0)`;

  yield* sql`CREATE TRIGGER debts_currency_is_cash_insert
    BEFORE INSERT ON debts
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'debt currency must be cash');
    END`;

  yield* sql`CREATE TRIGGER debts_currency_is_cash_update
    BEFORE UPDATE OF currency_asset_id ON debts
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'debt currency must be cash');
    END`;
});
