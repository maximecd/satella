import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/**
 * Goals become a first-class overlay on Accounts. One table holds the named
 * target; a join table records which Accounts contribute. Deleting an Account
 * or a Goal drops the join rows. An Account may appear on at most one Goal.
 */
export const addGoals = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    amount TEXT NOT NULL CHECK (length(trim(amount)) > 0),
    currency_asset_id TEXT NOT NULL REFERENCES assets(id),
    target_date TEXT CHECK (
      target_date IS NULL OR target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;

  yield* sql`CREATE TABLE goal_accounts (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    PRIMARY KEY (goal_id, account_id)
  ) STRICT`;

  yield* sql`CREATE UNIQUE INDEX goal_accounts_account_unique ON goal_accounts (account_id)`;

  yield* sql`CREATE TRIGGER goals_currency_is_cash_insert
    BEFORE INSERT ON goals
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'goal currency must be cash');
    END`;

  yield* sql`CREATE TRIGGER goals_currency_is_cash_update
    BEFORE UPDATE OF currency_asset_id ON goals
    WHEN (SELECT asset_category FROM assets WHERE id = NEW.currency_asset_id) <> 'cash'
    BEGIN
      SELECT RAISE(ABORT, 'goal currency must be cash');
    END`;
});
