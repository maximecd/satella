import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/** Store the optional MCP token hash on vault_security so it travels with Vault export. */
export const addMcpToken = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vault_security'`;
  if (tables.length === 0) return;
  const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(vault_security)`;
  if (!columns.some(({ name }) => name === "mcp_token_salt")) {
    yield* sql`ALTER TABLE vault_security ADD COLUMN mcp_token_salt TEXT`;
  }
  if (!columns.some(({ name }) => name === "mcp_token_hash")) {
    yield* sql`ALTER TABLE vault_security ADD COLUMN mcp_token_hash TEXT`;
  }
});
