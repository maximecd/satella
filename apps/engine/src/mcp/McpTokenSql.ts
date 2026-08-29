import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

import { db, firstOrNotFound, type FinanceEffect } from "../finance/internal/sql.js";
import { mcpTokenHash, mcpTokenMatches, newMcpToken, newMcpTokenSalt } from "./token.js";

interface McpTokenRow {
  readonly mcp_token_salt: string | null;
  readonly mcp_token_hash: string | null;
}

export const mcpTokenConfigured = (): FinanceEffect<boolean> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(
        sql<McpTokenRow>`SELECT mcp_token_salt, mcp_token_hash FROM vault_security WHERE id = 1`,
      ),
      "Vault security",
    );
    return row.mcp_token_hash !== null && row.mcp_token_salt !== null;
  });

export const verifyMcpToken = (token: string): FinanceEffect<boolean> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(
        sql<McpTokenRow>`SELECT mcp_token_salt, mcp_token_hash FROM vault_security WHERE id = 1`,
      ),
      "Vault security",
    );
    if (row.mcp_token_hash === null || row.mcp_token_salt === null) return false;
    return mcpTokenMatches(token, Buffer.from(row.mcp_token_salt, "base64"), row.mcp_token_hash);
  });

export const rotateMcpToken = (): FinanceEffect<string> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const token = newMcpToken();
    const salt = newMcpTokenSalt();
    const timestamp = new Date().toISOString();
    yield* db(
      sql`UPDATE vault_security
        SET mcp_token_salt = ${salt.toString("base64")},
            mcp_token_hash = ${mcpTokenHash(token, salt)},
            updated_at = ${timestamp}
        WHERE id = 1`,
    );
    return token;
  });
