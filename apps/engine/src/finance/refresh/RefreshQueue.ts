import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";

/**
 * One serialized refresh pipeline: a single worker consumes submitted jobs in
 * strict FIFO order, and submissions sharing a key coalesce onto the one
 * already pending or running, so a custodian never syncs twice back-to-back.
 */
export class RefreshQueue extends Context.Service<
  RefreshQueue,
  {
    readonly submit: <A, E>(key: string, job: Effect.Effect<A, E>) => Effect.Effect<A, E>;
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

  const submit = <A, E>(key: string, job: Effect.Effect<A, E>): Effect.Effect<A, E> =>
    Effect.gen(function* () {
      const existing = (yield* Ref.get(pending)).get(key);
      if (existing !== undefined) {
        // SAFETY: the coalesced deferred was created for this same key, so it
        // completes with exactly the result type of the joined job.
        return (yield* Deferred.await(existing)) as A;
      }
      const deferred = yield* Deferred.make<A, E>();
      yield* Ref.update(pending, (map) => new Map(map).set(key, deferred));
      yield* Queue.offer(jobs, { key, effect: job, deferred });
      return yield* Deferred.await(deferred);
    });

  return RefreshQueue.of({ submit });
});

export const layer = Layer.effect(RefreshQueue, make);
