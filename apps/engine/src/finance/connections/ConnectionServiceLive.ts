import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./ConnectionSql.js";
import { ConnectionService } from "./ConnectionService.js";

type SqlHttp = SqlClient.SqlClient | HttpClient.HttpClient;

const provide = <A, E>(
  sql: SqlClient.SqlClient,
  http: HttpClient.HttpClient,
  effect: Effect.Effect<A, E, SqlHttp>,
) =>
  effect.pipe(
    Effect.provideService(SqlClient.SqlClient, sql),
    Effect.provideService(HttpClient.HttpClient, http),
  );

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const http = yield* HttpClient.HttpClient;
  return ConnectionService.of({
    get: Effect.fn("ConnectionService.get")((id: string) =>
      provide(sql, http, Operations.getConnection(id)),
    ),
    list: Effect.fn("ConnectionService.list")(() =>
      provide(sql, http, Operations.listConnections()),
    ),
    connect: Effect.fn("ConnectionService.connect")((input) =>
      provide(sql, http, Operations.connectConnection(input)),
    ),
    refresh: Effect.fn("ConnectionService.refresh")((id: string) =>
      provide(sql, http, Operations.refreshConnection(id)),
    ),
    update: Effect.fn("ConnectionService.update")((id, input) =>
      provide(sql, http, Operations.updateConnection(id, input)),
    ),
    delete: Effect.fn("ConnectionService.delete")((id: string) =>
      provide(sql, http, Operations.deleteConnection(id)),
    ),
  });
});

export const layer = Layer.effect(ConnectionService, make);
