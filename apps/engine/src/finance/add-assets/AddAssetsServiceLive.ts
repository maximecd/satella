import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./AddAssetsSql.js";
import { AddAssetsService } from "./AddAssetsService.js";

const provideSql = <A, E>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provideService(SqlClient.SqlClient, sql));

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return AddAssetsService.of({
    listManualAccounts: Effect.fn("AddAssetsService.listManualAccounts")(() =>
      provideSql(sql, Operations.listManualAccounts()),
    ),
    lookupManualHolding: Effect.fn("AddAssetsService.lookupManualHolding")(
      (accountId, identifierType, identifierValue) =>
        provideSql(sql, Operations.lookupManualHolding(accountId, identifierType, identifierValue)),
    ),
    addManualHolding: Effect.fn("AddAssetsService.addManualHolding")((input) =>
      provideSql(sql, Operations.addManualHolding(input)),
    ),
    addCashAccount: Effect.fn("AddAssetsService.addCashAccount")((input) =>
      provideSql(sql, Operations.addCashAccount(input)),
    ),
    addOtherAsset: Effect.fn("AddAssetsService.addOtherAsset")((input) =>
      provideSql(sql, Operations.addOtherAsset(input)),
    ),
  });
});

export const layer = Layer.effect(AddAssetsService, make);
