import { HttpClient } from "effect/unstable/http";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import type { AutoRefreshStatus } from "../contracts.js";
import { AUTO_REFRESH_INTERVAL } from "../config.js";
import { makeWithVaultSql } from "../with-vault-sql.js";
import type { MarketDataRegistry } from "../market-data.js";
import { refreshCustodian } from "../custodians/CustodianSql.js";
import { VaultEvents } from "../../vault/VaultEvents.js";
import { VaultService } from "../../vault/Vault.js";
import { FailureLog, type FailureLogEntry } from "./FailureLog.js";
import { RefreshQueue } from "./RefreshQueue.js";
import { captureCycleTail, listSyncedCustodianIds } from "./RefreshCycle.js";

/**
 * Repeats a full refresh cycle while the vault is unlocked: once immediately
 * after each unlock, then at the fixed interval. Sleeps through vault closes
 * and machine sleep without any catch-up burst afterwards.
 */
export class AutoRefreshScheduler extends Context.Service<
  AutoRefreshScheduler,
  {
    readonly status: () => Effect.Effect<AutoRefreshStatus>;
  }
>()("@satella-app/engine/finance/AutoRefreshScheduler") {}

export const make = (options: { readonly registry?: MarketDataRegistry } = {}) =>
  Effect.gen(function* () {
    const vault = yield* VaultService;
    const events = yield* VaultEvents;
    const queue = yield* RefreshQueue;
    const failureLog = yield* FailureLog;
    const withSql = yield* makeWithVaultSql;
    const http = yield* HttpClient.HttpClient;
    const withHttp = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.provideService(HttpClient.HttpClient, http));

    const statusRef = yield* Ref.make<AutoRefreshStatus>({
      lastCycleAt: null,
      lastCycleOutcome: null,
    });

    // Custodians refresh through the same per-custodian queue keys the manual
    // path uses, so a click racing a cycle joins its job instead of producing a
    // duplicate back-to-back sync. Jobs run on the queue worker, so every
    // requirement is provided here.
    const submitCustodianRefresh = (id: string) =>
      queue.submit(id, withSql(withHttp(refreshCustodian(id))));

    const runCycle = Effect.gen(function* () {
      const syncedIds = yield* withSql(listSyncedCustodianIds());
      const failures: FailureLogEntry[] = [];
      for (const id of syncedIds) {
        const attempt = yield* submitCustodianRefresh(id).pipe(
          Effect.as(null),
          Effect.catch((error) => Effect.succeed(error)),
        );
        if (attempt === null) continue;
        failures.push({ custodianId: id, code: attempt.code, message: attempt.message });
        yield* failureLog.record({
          custodianId: id,
          code: attempt.code,
          message: attempt.message,
        });
      }
      const tailError = yield* queue.submit("cycle", withSql(captureCycleTail(options)));
      yield* Ref.set(statusRef, {
        lastCycleAt: new Date().toISOString(),
        lastCycleOutcome:
          tailError !== null || failures.length === syncedIds.length
            ? "failed"
            : failures.length > 0
              ? "partial"
              : "success",
      });
    }).pipe(Effect.ignore);

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          yield* events.awaitUnlock();
          yield* runCycle;
          let unlocked = true;
          while (unlocked) {
            yield* Effect.sleep(AUTO_REFRESH_INTERVAL);
            unlocked = (yield* vault.status()).state === "open";
            if (unlocked) yield* runCycle;
          }
        }),
      ),
    );

    return AutoRefreshScheduler.of({
      status: () => Ref.get(statusRef),
    });
  });

export const layer = (options: { readonly registry?: MarketDataRegistry } = {}) =>
  Layer.effect(AutoRefreshScheduler, make(options));
