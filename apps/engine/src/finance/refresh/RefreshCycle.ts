import { HttpClient } from "effect/unstable/http";
import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";
import type { ConnectorRegistry } from "@satella-app/connector-core";

import type { FinanceApiError } from "../contracts.js";
import { VaultService } from "../../vault/Vault.js";
import { REFRESH_COMPLETION_QUEUE_KEY, RefreshQueue } from "./RefreshQueue.js";
import { type MarketDataRegistry } from "../market-data.js";
import {
  completeRefreshPass,
  reconcileCustodian,
  type RefreshCompletionResult,
} from "../custodians/CustodianSql.js";
import { db } from "../internal/sql.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

type CycleEffect<A> = Effect.Effect<A, FinanceApiError, SqlClient.SqlClient>;

/** Every synced custodian, oldest first — the order a refresh cycle walks them in. */
export const listSyncedCustodianIds = (): CycleEffect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* db(
      sql<{ readonly id: string }>`SELECT id FROM custodians
        WHERE connector_id IS NOT NULL ORDER BY created_at, id`,
    ).pipe(Effect.map((rows) => rows.map(({ id }) => id)));
  });

/** Closes a refresh cycle with one price pass followed by one Snapshot. */
export const captureCycleTail = (
  options: { readonly registry?: MarketDataRegistry } = {},
): CycleEffect<RefreshCompletionResult> => completeCycle(options);

export interface RefreshCycleOptions {
  readonly connectorRegistry?: ConnectorRegistry;
  readonly registry?: MarketDataRegistry;
}

export interface RefreshCycleResult {
  readonly custodianFailures: ReadonlyArray<FinanceApiError>;
  readonly completion: RefreshCompletionResult;
}

export const completeCycle = (
  options: { readonly registry?: MarketDataRegistry } = {},
): CycleEffect<RefreshCompletionResult> => completeRefreshPass(options);

/** Reconciles each synced Custodian, then runs one shared completion pass. */
export const runAutomaticRefreshCycle = (
  options: RefreshCycleOptions = {},
): Effect.Effect<
  RefreshCycleResult,
  FinanceApiError,
  HttpClient.HttpClient | RefreshQueue | VaultService
> =>
  Effect.gen(function* () {
    const queue = yield* RefreshQueue;
    const withSql = yield* makeWithVaultSql;
    const http = yield* HttpClient.HttpClient;
    const withHttp = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.provideService(HttpClient.HttpClient, http));
    const syncedIds = yield* withSql(listSyncedCustodianIds());
    const completionGroup = yield* queue.beginCompletionGroup();
    return yield* Effect.gen(function* () {
      const failures: FinanceApiError[] = [];
      const attempts = yield* queue.submitMany(
        syncedIds.map((id) => {
          const reconcileOptions =
            options.connectorRegistry === undefined ? {} : { registry: options.connectorRegistry };
          return {
            key: id,
            job: withSql(withHttp(reconcileCustodian(id, reconcileOptions))).pipe(
              Effect.as(null),
              Effect.catch((error) => Effect.succeed(error)),
            ),
          };
        }),
      );
      for (const attempt of attempts) {
        if (attempt !== null) failures.push(attempt);
      }

      const completionOptions =
        options.registry === undefined ? {} : { registry: options.registry };
      const completion = yield* completionGroup.complete(
        queue.submit(
          REFRESH_COMPLETION_QUEUE_KEY,
          withSql(withHttp(completeCycle(completionOptions))),
        ),
      );
      return { custodianFailures: failures, completion };
    }).pipe(Effect.ensuring(completionGroup.abort()));
  });
