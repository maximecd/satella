import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

/**
 * Unlock signals emitted by the vault so in-engine background work can begin
 * the moment the vault opens, without polling its status.
 */
export class VaultEvents extends Context.Service<
  VaultEvents,
  {
    readonly notifyUnlocked: () => Effect.Effect<void>;
    readonly awaitUnlock: () => Effect.Effect<void>;
  }
>()("@satella-app/engine/VaultEvents") {}

export const make = Effect.gen(function* () {
  const slot = yield* Ref.make(Deferred.makeUnsafe<void>());
  return VaultEvents.of({
    notifyUnlocked: () =>
      Effect.gen(function* () {
        const deferred = yield* Ref.get(slot);
        yield* Effect.sync(() => {
          Deferred.doneUnsafe(deferred, Exit.void);
        });
      }),
    awaitUnlock: () =>
      Effect.gen(function* () {
        const deferred = yield* Ref.get(slot);
        yield* Deferred.await(deferred);
        yield* Ref.set(slot, Deferred.makeUnsafe<void>());
      }),
  });
});

export const layer = Layer.effect(VaultEvents, make);
