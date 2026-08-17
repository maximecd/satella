import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { HttpClient } from "effect/unstable/http";
import * as Operations from "./ConnectionSql.js";
import { ConnectionService } from "./ConnectionService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const withSql = yield* makeWithVaultSql;
  const withHttp = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(HttpClient.HttpClient, http));
  return ConnectionService.of({
    get: Effect.fn("ConnectionService.get")((id: string) =>
      withSql(withHttp(Operations.getConnection(id))),
    ),
    list: Effect.fn("ConnectionService.list")(() =>
      withSql(withHttp(Operations.listConnections())),
    ),
    connect: Effect.fn("ConnectionService.connect")((input) =>
      withSql(withHttp(Operations.connectConnection(input))),
    ),
    refresh: Effect.fn("ConnectionService.refresh")((id: string) =>
      withSql(withHttp(Operations.refreshConnection(id))),
    ),
    update: Effect.fn("ConnectionService.update")((id, input) =>
      withSql(withHttp(Operations.updateConnection(id, input))),
    ),
    delete: Effect.fn("ConnectionService.delete")((id: string) =>
      withSql(withHttp(Operations.deleteConnection(id))),
    ),
  });
});

export const layer = Layer.effect(ConnectionService, make);
