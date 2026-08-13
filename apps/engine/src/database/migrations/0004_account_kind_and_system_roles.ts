import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/**
 * Adds account kinds, system presentation roles, and deterministic backfill
 * for accounts created before those columns existed.
 */
export const addAccountKindAndSystemRoles = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`ALTER TABLE custodians ADD COLUMN presentation_role TEXT
    CHECK (presentation_role IS NULL OR presentation_role = 'direct_ownership')`;
  yield* sql`ALTER TABLE accounts ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'other'
    CHECK (account_kind IN ('current', 'savings', 'securities', 'crypto', 'other'))`;
  yield* sql`ALTER TABLE accounts ADD COLUMN presentation_role TEXT
    CHECK (presentation_role IS NULL OR presentation_role = 'direct_ownership')`;

  yield* sql`UPDATE accounts SET account_kind = 'securities'
    WHERE id IN (
      SELECT a.id FROM accounts a
      JOIN custodian_connectors cc ON cc.custodian_id = a.custodian_id
      WHERE cc.connector_id = 'ibkr'
    )`;
  yield* sql`UPDATE accounts SET account_kind = 'crypto'
    WHERE id IN (
      SELECT a.id FROM accounts a
      JOIN custodian_connectors cc ON cc.custodian_id = a.custodian_id
      WHERE cc.connector_id = 'okx'
    )`;
  yield* sql`UPDATE accounts SET account_kind = 'securities'
    WHERE account_kind = 'other'
      AND EXISTS (
        SELECT 1 FROM positions p JOIN assets s ON s.id = p.asset_id
        WHERE p.account_id = accounts.id AND s.asset_class = 'security'
      )
      AND NOT EXISTS (
        SELECT 1 FROM positions p JOIN assets s ON s.id = p.asset_id
        WHERE p.account_id = accounts.id AND s.asset_class IN ('crypto', 'custom')
      )`;
  yield* sql`UPDATE accounts SET account_kind = 'crypto'
    WHERE account_kind = 'other'
      AND EXISTS (
        SELECT 1 FROM positions p JOIN assets s ON s.id = p.asset_id
        WHERE p.account_id = accounts.id AND s.asset_class = 'crypto'
      )
      AND NOT EXISTS (
        SELECT 1 FROM positions p JOIN assets s ON s.id = p.asset_id
        WHERE p.account_id = accounts.id AND s.asset_class IN ('security', 'custom')
      )`;
  yield* sql`UPDATE accounts SET account_kind = 'current'
    WHERE account_kind = 'other'
      AND EXISTS (
        SELECT 1 FROM positions p JOIN assets s ON s.id = p.asset_id
        WHERE p.account_id = accounts.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM positions p JOIN assets s ON s.id = p.asset_id
        WHERE p.account_id = accounts.id AND s.asset_class <> 'fiat'
      )`;

  yield* sql`CREATE TRIGGER custodians_presentation_role_immutable
    BEFORE UPDATE OF presentation_role ON custodians
    WHEN NEW.presentation_role IS NOT OLD.presentation_role
    BEGIN
      SELECT RAISE(ABORT, 'custodian presentation_role is immutable');
    END`;
  yield* sql`CREATE TRIGGER accounts_presentation_role_immutable
    BEFORE UPDATE OF presentation_role ON accounts
    WHEN NEW.presentation_role IS NOT OLD.presentation_role
    BEGIN
      SELECT RAISE(ABORT, 'account presentation_role is immutable');
    END`;
  yield* sql`CREATE TRIGGER custodians_system_role_manual_insert
    BEFORE INSERT ON custodians
    WHEN NEW.presentation_role IS NOT NULL AND NEW.management_mode <> 'manual'
    BEGIN
      SELECT RAISE(ABORT, 'system custodians must be manual');
    END`;
  yield* sql`CREATE TRIGGER custodians_system_role_manual_update
    BEFORE UPDATE OF presentation_role, management_mode ON custodians
    WHEN NEW.presentation_role IS NOT NULL AND NEW.management_mode <> 'manual'
    BEGIN
      SELECT RAISE(ABORT, 'system custodians must be manual');
    END`;
});
