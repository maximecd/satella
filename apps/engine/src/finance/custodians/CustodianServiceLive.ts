import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./CustodianSql.js";
import { CustodianService } from "./CustodianService.js";

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
  return CustodianService.of({
    get: Effect.fn("CustodianService.get")((id: string) =>
      provide(sql, http, Operations.getCustodian(id)),
    ),
    list: Effect.fn("CustodianService.list")(() => provide(sql, http, Operations.listCustodians())),
    create: Effect.fn("CustodianService.create")((input) =>
      provide(sql, http, Operations.createCustodian(input)),
    ),
    connect: Effect.fn("CustodianService.connect")((input) =>
      provide(sql, http, Operations.connectCustodian(input)),
    ),
    resync: Effect.fn("CustodianService.resync")((id: string) =>
      provide(sql, http, Operations.resyncCustodian(id)),
    ),
    update: Effect.fn("CustodianService.update")((id, input) =>
      provide(sql, http, Operations.updateCustodian(id, input)),
    ),
    delete: Effect.fn("CustodianService.delete")((id: string) =>
      provide(sql, http, Operations.deleteCustodian(id)),
    ),
  });
});

export const layer = Layer.effect(CustodianService, make);
