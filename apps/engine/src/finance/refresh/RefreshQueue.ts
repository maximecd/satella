import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";

export interface RefreshCompletionGroup {
  readonly complete: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>;
  /** Releases the group when the owner fails before submitting its tail. */
  readonly abort: () => Effect.Effect<void>;
}

/**
 * One serialized refresh pipeline: a single worker consumes submitted jobs in
 * strict FIFO order, and submissions sharing a key coalesce onto the one
 * already pending or running, so a custodian never syncs twice back-to-back.
 */
export class RefreshQueue extends Context.Service<
  RefreshQueue,
  {
    readonly submit: <A, E>(key: string, job: Effect.Effect<A, E>) => Effect.Effect<A, E>;
    readonly submitMany: <A, E>(
      jobs: ReadonlyArray<{
        readonly key: string;
        readonly job: Effect.Effect<A, E>;
      }>,
    ) => Effect.Effect<ReadonlyArray<A>, E>;
    readonly beginCompletionGroup: () => Effect.Effect<RefreshCompletionGroup>;
  }
>()("@satella-app/engine/finance/RefreshQueue") {}

/** All manual and automatic price/snapshot tails share this queue slot. */
export const REFRESH_COMPLETION_QUEUE_KEY = "refresh-completion";

interface Job {
  readonly key: string;
  readonly effect: Effect.Effect<any, any>;
  readonly deferred: Deferred.Deferred<any, any>;
}

export const make = Effect.gen(function* () {
  const pending = yield* Ref.make(new Map<string, Deferred.Deferred<any, any>>());
  const activeCompletion = yield* Ref.make<CompletionGroupState | undefined>(undefined);
  const jobs = yield* Queue.unbounded<Job>();

  yield* Effect.forkScoped(
    Effect.forever(
      Effect.gen(function* () {
        const job = yield* Queue.take(jobs);
        const exit = yield* Effect.exit(job.effect);
        yield* Ref.update(pending, (map) => {
          if (map.get(job.key) === job.deferred) map.delete(job.key);
          return map;
        });
        yield* Deferred.done(job.deferred, exit);
      }),
    ),
  );

  const submitMany = <A, E>(
    entries: ReadonlyArray<{
      readonly key: string;
      readonly job: Effect.Effect<A, E>;
    }>,
  ): Effect.Effect<ReadonlyArray<A>, E> =>
    Effect.gen(function* () {
      const deferreds = yield* Effect.forEach(entries, () => Deferred.make<A, E>());
      const registrations: ReadonlyArray<QueueRegistration> = yield* Ref.modify<
        Map<string, Deferred.Deferred<any, any>>,
        ReadonlyArray<QueueRegistration>
      >(pending, (map) => {
        const next = new Map(map);
        const registrations = entries.map((entry, index) => {
          const existing = next.get(entry.key);
          if (existing !== undefined) return { owner: false, deferred: existing };
          const deferred = deferreds[index]!;
          next.set(entry.key, deferred);
          return { owner: true, deferred };
        });
        return [registrations, next];
      });

      for (const [index, registration] of registrations.entries()) {
        if (registration.owner) {
          yield* Queue.offer(jobs, {
            key: entries[index]!.key,
            effect: entries[index]!.job,
            deferred: registration.deferred,
          });
        }
      }

      return yield* Effect.forEach(
        registrations,
        (registration) =>
          // SAFETY: every coalesced deferred belongs to the same submitted key
          // and therefore completes with the result type of that job.
          Deferred.await(registration.deferred) as Effect.Effect<A, E>,
      );
    });

  const submit = <A, E>(key: string, job: Effect.Effect<A, E>): Effect.Effect<A, E> =>
    submitMany([{ key, job }]).pipe(Effect.map(([value]) => value!));

  const beginCompletionGroup = Effect.gen(function* () {
    const deferred = yield* Deferred.make<any, any>();
    const registration = yield* Ref.modify(activeCompletion, (active) => {
      if (active !== undefined) return [{ owner: false, group: active }, active];
      const group = { deferred } satisfies CompletionGroupState;
      return [{ owner: true, group }, group];
    });
    return {
      complete: <A, E>(effect: Effect.Effect<A, E>) =>
        registration.owner
          ? Effect.gen(function* () {
              const exit = yield* Effect.exit(effect);
              yield* Ref.modify<CompletionGroupState | undefined, void>(
                activeCompletion,
                (active) => [undefined, active === registration.group ? undefined : active],
              );
              yield* Deferred.done(registration.group.deferred, exit);
              return yield* exit;
            })
          : Deferred.await(registration.group.deferred),
      abort: () =>
        registration.owner
          ? Effect.gen(function* () {
              const shouldInterrupt = yield* Ref.modify<CompletionGroupState | undefined, boolean>(
                activeCompletion,
                (active) => (active === registration.group ? [true, undefined] : [false, active]),
              );
              if (shouldInterrupt) yield* Deferred.interrupt(registration.group.deferred);
            })
          : Effect.void,
    } satisfies RefreshCompletionGroup;
  });

  return RefreshQueue.of({
    submit,
    submitMany,
    beginCompletionGroup: () => beginCompletionGroup,
  });
});

interface QueueRegistration {
  readonly owner: boolean;
  readonly deferred: Deferred.Deferred<any, any>;
}

interface CompletionGroupState {
  readonly deferred: Deferred.Deferred<any, any>;
}

export const layer = Layer.effect(RefreshQueue, make);
