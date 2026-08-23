import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

/** Add per-Vault EVM RPC preferences, defaulting existing Vaults to public endpoints. */
export const addEvmRpcSettings = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(app_settings)`;
  if (!columns.some(({ name }) => name === "evm_rpc_config_json")) {
    yield* sql`ALTER TABLE app_settings
      ADD COLUMN evm_rpc_config_json TEXT NOT NULL DEFAULT '{"mode":"public"}'`;
  }
});
