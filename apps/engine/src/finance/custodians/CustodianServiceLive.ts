import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import { HttpClient } from "effect/unstable/http";
import * as Operations from "./CustodianSql.js";
import { CustodianService } from "./CustodianService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";
import { REFRESH_COMPLETION_QUEUE_KEY, RefreshQueue } from "../refresh/RefreshQueue.js";
import type { CustodianRefreshResult, FinanceApiError } from "../contracts.js";

export const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const queue = yield* RefreshQueue;
  const withSql = yield* makeWithVaultSql;
  type ManualRefreshMap = Map<string, Deferred.Deferred<CustodianRefreshResult, FinanceApiError>>;
  const manualRefreshes = yield* Ref.make(
    new Map<string, Deferred.Deferred<CustodianRefreshResult, FinanceApiError>>(),
  );
  const withHttp = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(HttpClient.HttpClient, http));
  type ManualRefreshRegistration = {
    readonly owner: boolean;
    readonly deferred: Deferred.Deferred<CustodianRefreshResult, FinanceApiError>;
  };
  const refresh = (id: string): Effect.Effect<CustodianRefreshResult, FinanceApiError> =>
    Effect.gen(function* () {
      const deferred = yield* Deferred.make<CustodianRefreshResult, FinanceApiError>();
      const registration: ManualRefreshRegistration = yield* Ref.modify<
        ManualRefreshMap,
        ManualRefreshRegistration
      >(manualRefreshes, (active) => {
        const existing = active.get(id);
        if (existing !== undefined) {
          return [{ owner: false, deferred: existing }, active];
        }
        return [{ owner: true, deferred }, new Map(active).set(id, deferred)];
      });
      if (!registration.owner) return yield* Deferred.await(registration.deferred);

      const result = yield* Effect.exit(
        Effect.gen(function* () {
          const completionGroup = yield* queue.beginCompletionGroup();
          return yield* Effect.gen(function* () {
            yield* queue.submit(id, withSql(withHttp(Operations.reconcileCustodian(id))));
            const completion = yield* completionGroup.complete(
              queue.submit(
                REFRESH_COMPLETION_QUEUE_KEY,
                withSql(withHttp(Operations.completeRefreshPass())),
              ),
            );
            if (completion.error !== null) return yield* Effect.fail(completion.error);
            return yield* withSql(withHttp(Operations.getCustodian(id))).pipe(
              Effect.map((custodian) => ({ custodian, failures: completion.failures })),
            );
          }).pipe(Effect.ensuring(completionGroup.abort()));
        }),
      );
      yield* Ref.update(manualRefreshes, (active) => {
        if (active.get(id) !== registration.deferred) return active;
        const next = new Map(active);
        next.delete(id);
        return next;
      });
      yield* Deferred.done(registration.deferred, result);
      return yield* Deferred.await(registration.deferred);
    });
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
    refresh: Effect.fn("CustodianService.refresh")((id: string) => refresh(id)),
    update: Effect.fn("CustodianService.update")((id, input) =>
      withSql(withHttp(Operations.updateCustodian(id, input))),
    ),
    delete: Effect.fn("CustodianService.delete")((id: string) =>
      withSql(withHttp(Operations.deleteCustodian(id))),
    ),
  });
});

export const layer = Layer.effect(CustodianService, make);
