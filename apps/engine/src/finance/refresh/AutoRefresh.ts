import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { ConnectorRegistry } from "@satella-app/connector-core";
import { AUTO_REFRESH_INTERVAL } from "../config.js";
import type { MarketDataRegistry } from "../market-data.js";
import { VaultEvents } from "../../vault/VaultEvents.js";
import { VaultService } from "../../vault/Vault.js";
import { runAutomaticRefreshCycle } from "./RefreshCycle.js";

/** Runs Refresh immediately after unlock and every fifteen minutes while open. */
export class AutoRefreshScheduler extends Context.Service<
  AutoRefreshScheduler,
  Record<never, never>
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

    const runCycle = runAutomaticRefreshCycle(options).pipe(
      // A defect in one cycle must not kill the scheduler fiber. Expected
      // connector and price failures are returned by the cycle and logged.
      Effect.catchCause(() => Effect.void),
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

    return AutoRefreshScheduler.of({});
  });

export const layer = (
  options: {
    readonly registry?: MarketDataRegistry;
    readonly connectorRegistry?: ConnectorRegistry;
  } = {},
) => Layer.effect(AutoRefreshScheduler, make(options));
