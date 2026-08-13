import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./AccountSql.js";
import { AccountService } from "./AccountService.js";

const provideSql = <A, E>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provideService(SqlClient.SqlClient, sql));

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return AccountService.of({
    get: Effect.fn("AccountService.get")((id: string) =>
      provideSql(sql, Operations.getAccount(id)),
    ),
    create: Effect.fn("AccountService.create")((input) =>
      provideSql(sql, Operations.createAccount(input)),
    ),
    update: Effect.fn("AccountService.update")((id, input) =>
      provideSql(sql, Operations.updateAccount(id, input)),
    ),
    delete: Effect.fn("AccountService.delete")((id: string) =>
      provideSql(sql, Operations.deleteAccount(id)),
    ),
  });
});

export const layer = Layer.effect(AccountService, make);
