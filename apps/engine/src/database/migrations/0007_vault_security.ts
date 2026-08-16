import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/** Screen-lock PIN verifier and timeout live inside the encrypted Vault. */
export const addVaultSecurity = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE vault_security (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    screen_lock_timeout_minutes INTEGER NOT NULL CHECK (screen_lock_timeout_minutes IN (5, 15, 30, 60)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`;
});
