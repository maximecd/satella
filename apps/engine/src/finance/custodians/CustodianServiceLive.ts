import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { HttpClient } from "effect/unstable/http";
import * as Operations from "./CustodianSql.js";
import { CustodianService } from "./CustodianService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";
import { RefreshQueue } from "../refresh/RefreshQueue.js";

export const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const queue = yield* RefreshQueue;
  const withSql = yield* makeWithVaultSql;
  const withHttp = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(HttpClient.HttpClient, http));
  return CustodianService.of({
    get: Effect.fn("CustodianService.get")((id: string) =>
      withSql(withHttp(Operations.getCustodian(id))),
    ),
    list: Effect.fn("CustodianService.list")(() => withSql(withHttp(Operations.listCustodians()))),
    create: Effect.fn("CustodianService.create")((input) =>
      withSql(withHttp(Operations.createCustodian(input))),
    ),
    connect: Effect.fn("CustodianService.connect")((input) =>
      withSql(withHttp(Operations.connectCustodian(input))),
    ),
    refresh: Effect.fn("CustodianService.refresh")((id: string) =>
      // Manual and automatic refreshes share the same queued reconciliation.
      // Queueing the manual completion separately keeps that behavior complete
      // when an automatic reconciliation is already in flight.
      queue
        .submit(id, withSql(withHttp(Operations.reconcileCustodian(id))))
        .pipe(
          Effect.andThen(
            queue.submit(
              `manual-complete:${id}`,
              withSql(withHttp(Operations.completeCustodianRefresh(id))),
            ),
          ),
        ),
    ),
    update: Effect.fn("CustodianService.update")((id, input) =>
      withSql(withHttp(Operations.updateCustodian(id, input))),
    ),
    delete: Effect.fn("CustodianService.delete")((id: string) =>
      withSql(withHttp(Operations.deleteCustodian(id))),
    ),
  });
});

export const layer = Layer.effect(CustodianService, make);
