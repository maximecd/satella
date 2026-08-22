import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/** Add the per-Vault App language, preserving existing Vaults as English. */
export const addAppLanguage = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(app_settings)`;
  if (!columns.some(({ name }) => name === "app_language")) {
    yield* sql`ALTER TABLE app_settings
      ADD COLUMN app_language TEXT NOT NULL DEFAULT 'en'
      CHECK (app_language IN ('en', 'fr'))`;
  }
});
