import { HttpClient } from "effect/unstable/http";
import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";
import type { ConnectorRegistry } from "@satella-app/connector-core";

import type { AutoRefreshStatus, FinanceApiError } from "../contracts.js";
import { FailureLog, type FailureLogEntry } from "./FailureLog.js";
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

/**
 * Closes a refresh cycle: one price refresh across all assets followed by a
 * snapshot, so portfolio value history stays current even without synced
 * custodians.
 */
export const captureCycleTail = (
  options: { readonly registry?: MarketDataRegistry } = {},
): CycleEffect<FinanceApiError | null> =>
  completeCycle(options).pipe(Effect.map(({ error }) => error));

export interface RefreshCycleOptions {
  readonly connectorRegistry?: ConnectorRegistry;
  readonly registry?: MarketDataRegistry;
  readonly now?: () => Date;
}

export type RefreshCycleCompletion = RefreshCompletionResult;

export interface RefreshCycleResult {
  readonly status: AutoRefreshStatus;
  readonly custodianFailures: ReadonlyArray<FailureLogEntry>;
  readonly completion: RefreshCycleCompletion;
}

/** Completes an automatic cycle exactly once, even when its price pass fails. */
export const completeCycle = (
  options: { readonly registry?: MarketDataRegistry } = {},
): CycleEffect<RefreshCycleCompletion> => completeRefreshPass(options);

const cycleOutcome = (
  custodianCount: number,
  custodianFailureCount: number,
  completion: RefreshCycleCompletion,
): AutoRefreshStatus["lastCycleOutcome"] => {
  if (completion.error !== null || (custodianCount > 0 && custodianFailureCount === custodianCount))
    return "failed";
  if (custodianFailureCount > 0 || completion.failures.length > 0) return "partial";
  return "success";
};

/**
 * Runs the automatic cycle through the same queue used by manual refreshes.
 * Custodian reconciliation is deliberately separate from the one completion
 * pass so intermediate Custodian work cannot create intermediate Snapshots.
 */
export const runAutomaticRefreshCycle = (
  options: RefreshCycleOptions = {},
): Effect.Effect<
  RefreshCycleResult,
  FinanceApiError,
  HttpClient.HttpClient | FailureLog | RefreshQueue | import("../../vault/Vault.js").VaultService
> =>
  Effect.gen(function* () {
    const queue = yield* RefreshQueue;
    const failureLog = yield* FailureLog;
    const withSql = yield* makeWithVaultSql;
    const http = yield* HttpClient.HttpClient;
    const withHttp = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.provideService(HttpClient.HttpClient, http));
    const syncedIds = yield* withSql(listSyncedCustodianIds());
    const failures: FailureLogEntry[] = [];

    for (const id of syncedIds) {
      const reconcileOptions =
        options.connectorRegistry === undefined ? {} : { registry: options.connectorRegistry };
      const attempt = yield* queue
        .submit(id, withSql(withHttp(reconcileCustodian(id, reconcileOptions))))
        .pipe(
          Effect.as(null),
          Effect.catch((error) => Effect.succeed(error)),
        );
      if (attempt === null) continue;
      const entry = { custodianId: id, code: attempt.code, message: attempt.message };
      failures.push(entry);
      yield* failureLog.record(entry);
    }

    const completion = yield* queue.submit(
      REFRESH_COMPLETION_QUEUE_KEY,
      withSql(completeCycle(options)),
    );
    const lastCycleOutcome = cycleOutcome(syncedIds.length, failures.length, completion);
    return {
      status: {
        lastCycleAt: (options.now ?? (() => new Date()))().toISOString(),
        lastCycleOutcome,
      },
      custodianFailures: failures,
      completion,
    };
  });
