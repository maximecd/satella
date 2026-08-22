import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type { AutoRefreshStatus } from "../contracts.js";
import type { ConnectorRegistry } from "@satella-app/connector-core";
import { AUTO_REFRESH_INTERVAL } from "../config.js";
import type { MarketDataRegistry } from "../market-data.js";
import { VaultEvents } from "../../vault/VaultEvents.js";
import { VaultService } from "../../vault/Vault.js";
import { ManagedRuntime } from "../../runtime/ManagedRuntime.js";
import { runAutomaticRefreshCycle } from "./RefreshCycle.js";

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

export const make = (
  options: {
    readonly registry?: MarketDataRegistry;
    readonly connectorRegistry?: ConnectorRegistry;
  } = {},
) =>
  Effect.gen(function* () {
    const vault = yield* VaultService;
    const events = yield* VaultEvents;
    const managedRuntime = yield* Effect.serviceOption(ManagedRuntime);

    const statusRef = yield* Ref.make<AutoRefreshStatus>({
      lastCycleAt: null,
      lastCycleOutcome: null,
    });
    const publishStatus = (status: AutoRefreshStatus) =>
      Option.isSome(managedRuntime) ? managedRuntime.value.publishAutoRefresh(status) : Effect.void;
    yield* publishStatus(yield* Ref.get(statusRef));

    const runCycle = runAutomaticRefreshCycle(options).pipe(
      Effect.tap(({ status }) =>
        Ref.set(statusRef, status).pipe(Effect.andThen(publishStatus(status))),
      ),
      Effect.ignore,
    );

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

export const layer = (
  options: {
    readonly registry?: MarketDataRegistry;
    readonly connectorRegistry?: ConnectorRegistry;
  } = {},
) => Layer.effect(AutoRefreshScheduler, make(options));
