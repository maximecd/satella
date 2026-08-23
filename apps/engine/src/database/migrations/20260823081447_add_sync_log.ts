import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/** Stores completed synchronization attempts inside the encrypted Vault. */
export const addSyncLog = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE sync_log (
    id TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('asset', 'custodian')),
    subject_name TEXT NOT NULL CHECK (length(trim(subject_name)) > 0),
    action TEXT NOT NULL CHECK (action IN ('price_check', 'refresh')),
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
    failure_reason TEXT,
    CHECK ((outcome = 'success' AND failure_reason IS NULL)
      OR (outcome = 'failure' AND failure_reason IS NOT NULL
        AND length(trim(failure_reason)) > 0))
  ) STRICT`;
  yield* sql`CREATE INDEX sync_log_completed_at_id
    ON sync_log(completed_at DESC, id DESC)`;
});
