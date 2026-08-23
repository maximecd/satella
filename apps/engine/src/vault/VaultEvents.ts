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
    readonly notifyClosed: () => Effect.Effect<void>;
    readonly awaitClosed: () => Effect.Effect<void>;
  }
>()("@satella-app/engine/VaultEvents") {}

export const make = Effect.gen(function* () {
  const unlockSlot = yield* Ref.make(Deferred.makeUnsafe<void>());
  const closeSlot = yield* Ref.make(Deferred.makeUnsafe<void>());
  return VaultEvents.of({
    notifyUnlocked: () =>
      Effect.gen(function* () {
        const deferred = yield* Ref.get(unlockSlot);
        yield* Effect.sync(() => {
          Deferred.doneUnsafe(deferred, Exit.void);
        });
      }),
    awaitUnlock: () =>
      Effect.gen(function* () {
        const deferred = yield* Ref.get(unlockSlot);
        yield* Deferred.await(deferred);
        yield* Ref.set(unlockSlot, Deferred.makeUnsafe<void>());
      }),
    notifyClosed: () =>
      Effect.gen(function* () {
        const deferred = yield* Ref.get(closeSlot);
        yield* Effect.sync(() => {
          Deferred.doneUnsafe(deferred, Exit.void);
        });
      }),
    awaitClosed: () =>
      Effect.gen(function* () {
        const deferred = yield* Ref.get(closeSlot);
        yield* Deferred.await(deferred);
        yield* Ref.set(closeSlot, Deferred.makeUnsafe<void>());
      }),
  });
});

export const layer = Layer.effect(VaultEvents, make);
