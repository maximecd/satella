import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

import { FinanceApiError } from "./contracts.js";
import { VaultStateError } from "../vault/errors.js";
import { VaultService } from "../vault/Vault.js";

const toFinanceError = (error: VaultStateError) =>
  new FinanceApiError({
    code: error.reason === "screen-locked" ? "screen_locked" : "vault_closed",
    message: error.message,
  });

export const makeWithVaultSql = Effect.gen(function* () {
  const vault = yield* VaultService;
  return <A, E>(
    effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  ): Effect.Effect<A, E | FinanceApiError> =>
    vault.currentSql().pipe(
      Effect.mapError((error) =>
        error instanceof VaultStateError ? toFinanceError(error) : error,
      ),
      Effect.flatMap((sql) => effect.pipe(Effect.provideService(SqlClient.SqlClient, sql))),
    );
});
