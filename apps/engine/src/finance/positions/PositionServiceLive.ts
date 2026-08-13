import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./PositionSql.js";
import { PositionService } from "./PositionService.js";

const provideSql = <A, E>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provideService(SqlClient.SqlClient, sql));

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return PositionService.of({
    create: Effect.fn("PositionService.create")((input) =>
      provideSql(sql, Operations.createPosition(input)),
    ),
    update: Effect.fn("PositionService.update")((id, quantity) =>
      provideSql(sql, Operations.updatePosition(id, quantity)),
    ),
    getAccount: Effect.fn("PositionService.getAccount")((id: string) =>
      provideSql(sql, Operations.getPositionAccount(id)),
    ),
    delete: Effect.fn("PositionService.delete")((id: string) =>
      provideSql(sql, Operations.deletePosition(id)),
    ),
  });
});

export const layer = Layer.effect(PositionService, make);
