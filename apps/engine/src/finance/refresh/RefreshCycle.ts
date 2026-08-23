import { HttpClient } from "effect/unstable/http";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import * as Clock from "effect/Clock";
import { SqlClient } from "effect/unstable/sql";
import type { ConnectorRegistry } from "@satella-app/connector-core";

import type { FinanceApiError } from "../contracts.js";
import { AUTO_REFRESH_INTERVAL } from "../config.js";
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

interface RefreshDueOptions {
  connectorRegistry?: ConnectorRegistry;
  now?: () => Date;
}

interface ReconcileOptions {
  registry?: ConnectorRegistry;
  now?: () => Date;
}

/** Every due synced custodian, oldest first — the order a refresh cycle walks them in. */
export const listSyncedCustodianIds = (
  options: RefreshDueOptions = {},
): CycleEffect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{
        readonly id: string;
        readonly connector_id: string;
        readonly sync_state: "ready" | "reauthentication_required";
        readonly last_refresh_attempt_at: string | null;
      }>`SELECT id, connector_id, sync_state, last_refresh_attempt_at FROM custodians
        WHERE connector_id IS NOT NULL ORDER BY created_at, id`,
    );
    const now = options.now === undefined ? yield* Clock.currentTimeMillis : options.now().getTime();
    const defaultCadence = Duration.toMillis(AUTO_REFRESH_INTERVAL);
    return rows
      .filter(({ connector_id, sync_state, last_refresh_attempt_at }) => {
        if (sync_state === "reauthentication_required") return false;
        const cadence =
          options.connectorRegistry?.get(connector_id)?.autoRefreshIntervalMs ?? defaultCadence;
        if (last_refresh_attempt_at === null) return true;
        const lastAttempt = Date.parse(last_refresh_attempt_at);
        return !Number.isFinite(lastAttempt) || now - lastAttempt >= cadence;
      })
      .map(({ id }) => id);
  });

/** Closes a refresh cycle with one price pass followed by one Snapshot. */
export const captureCycleTail = (
  options: { readonly registry?: MarketDataRegistry } = {},
): CycleEffect<RefreshCompletionResult> => completeCycle(options);

export interface RefreshCycleOptions {
  readonly connectorRegistry?: ConnectorRegistry;
  readonly registry?: MarketDataRegistry;
  readonly now?: () => Date;
}

export interface RefreshCycleResult {
  readonly custodianFailures: ReadonlyArray<FinanceApiError>;
  readonly completion: RefreshCompletionResult;
}

export const completeCycle = (
  options: { readonly registry?: MarketDataRegistry } = {},
): CycleEffect<RefreshCompletionResult> => completeRefreshPass(options);

/** Reconciles each due synced Custodian, then runs one shared completion pass. */
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
    const dueOptions: RefreshDueOptions = {};
    if (options.connectorRegistry !== undefined)
      Object.assign(dueOptions, { connectorRegistry: options.connectorRegistry });
    if (options.now !== undefined) Object.assign(dueOptions, { now: options.now });
    const syncedIds = yield* withSql(listSyncedCustodianIds(dueOptions));
    const completionGroup = yield* queue.beginCompletionGroup();
    return yield* Effect.gen(function* () {
      const failures: FinanceApiError[] = [];
      const attempts = yield* queue.submitMany(
        syncedIds.map((id) => {
          const reconcileOptions: ReconcileOptions = {};
          if (options.connectorRegistry !== undefined)
            Object.assign(reconcileOptions, { registry: options.connectorRegistry });
          if (options.now !== undefined) Object.assign(reconcileOptions, { now: options.now });
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
