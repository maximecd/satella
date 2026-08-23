import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/** Records automatic-refresh eligibility and authentication suspension per synced Custodian. */
export const addCustodianSyncState = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(custodians)`;
  // Keep the migration compatible with the minimal released-schema fixture used
  // by database upgrade tests. A real production initial schema always has this table.
  if (columns.length === 0) return;
  if (!columns.some(({ name }) => name === "sync_state")) {
    yield* sql`ALTER TABLE custodians
      ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'ready'
      CHECK (sync_state IN ('ready', 'reauthentication_required'))`;
  }
  if (!columns.some(({ name }) => name === "last_refresh_attempt_at")) {
    yield* sql`ALTER TABLE custodians ADD COLUMN last_refresh_attempt_at TEXT`;
  }
});
