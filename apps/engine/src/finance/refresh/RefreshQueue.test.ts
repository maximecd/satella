import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

import { describe, expect, it } from "@effect/vitest";

import { FinanceApiError } from "../contracts.js";
import { RefreshQueue } from "./RefreshQueue.js";
import { layer as RefreshQueueLive } from "./RefreshQueue.js";

const makeGate = () => {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    open: () => release(),
    wait: Effect.tryPromise(() => opened),
  };
};

describe("refresh queue", () => {
  it.effect("runs one job at a time in submission order", () =>
    Effect.gen(function* () {
      const queue = yield* RefreshQueue;
      const gate = makeGate();
      const startedA = yield* Deferred.make<void>();
      const events: string[] = [];

      const first = yield* Effect.forkChild(
        queue.submit(
          "a",
          Effect.gen(function* () {
            events.push("a-start");
            yield* Deferred.succeed(startedA, undefined);
            yield* gate.wait;
            events.push("a-end");
            return "a";
          }),
        ),
      );
      const second = yield* Effect.forkChild(
        queue.submit(
          "b",
          Effect.sync((): "b" => {
            events.push("b");
            return "b";
          }),
        ),
      );

      yield* Deferred.await(startedA);
      expect(events).toEqual(["a-start"]);

      gate.open();
      expect(yield* Fiber.join(first)).toBe("a");
      expect(yield* Fiber.join(second)).toBe("b");
      expect(events).toEqual(["a-start", "a-end", "b"]);
    }).pipe(Effect.provide(RefreshQueueLive)),
  );

  it.effect("coalesces a concurrent submission onto the running job", () =>
    Effect.gen(function* () {
      const queue = yield* RefreshQueue;
      const gate = makeGate();
      const started = yield* Deferred.make<void>();
      let runs = 0;

      const slow = Effect.gen(function* () {
        runs += 1;
        yield* Deferred.succeed(started, undefined);
        yield* gate.wait;
        return "result";
      });

      const first = yield* Effect.forkChild(queue.submit("custodian", slow));
      yield* Deferred.await(started);
      const second = yield* Effect.forkChild(queue.submit("custodian", slow));
      yield* Effect.yieldNow;

      gate.open();
      expect(yield* Fiber.join(first)).toBe("result");
      expect(yield* Fiber.join(second)).toBe("result");
      expect(runs).toBe(1);
    }).pipe(Effect.provide(RefreshQueueLive)),
  );

  it.effect("atomically coalesces simultaneous pending registrations", () =>
    Effect.gen(function* () {
      const queue = yield* RefreshQueue;
      const gate = makeGate();
      const started = yield* Deferred.make<void>();
      let runs = 0;
      const job = Effect.gen(function* () {
        runs += 1;
        yield* Deferred.succeed(started, undefined);
        yield* gate.wait;
        return "shared";
      });
      const all = yield* Effect.forkChild(
        Effect.all(
          Array.from({ length: 20 }, () => queue.submit("same-key", job)),
          { concurrency: "unbounded" },
        ),
      );
      yield* Deferred.await(started);
      yield* Effect.yieldNow;
      gate.open();
      expect(yield* Fiber.join(all)).toEqual(Array.from({ length: 20 }, () => "shared"));
      expect(runs).toBe(1);
    }).pipe(Effect.provide(RefreshQueueLive)),
  );

  it.effect("reserves every batch key before the first automatic job starts", () =>
    Effect.gen(function* () {
      const queue = yield* RefreshQueue;
      const gate = makeGate();
      const firstStarted = yield* Deferred.make<void>();
      let secondRuns = 0;

      const automatic = yield* Effect.forkChild(
        queue.submitMany([
          {
            key: "first",
            job: Effect.gen(function* () {
              yield* Deferred.succeed(firstStarted, undefined);
              yield* gate.wait;
              return "first";
            }),
          },
          {
            key: "second",
            job: Effect.sync(() => {
              secondRuns += 1;
              return "second";
            }),
          },
        ]),
      );
      yield* Deferred.await(firstStarted);

      const manual = yield* Effect.forkChild(
        queue.submit(
          "second",
          Effect.sync(() => {
            secondRuns += 1;
            return "manual";
          }),
        ),
      );
      gate.open();

      expect(yield* Fiber.join(automatic)).toEqual(["first", "second"]);
      expect(yield* Fiber.join(manual)).toBe("second");
      expect(secondRuns).toBe(1);
    }).pipe(Effect.provide(RefreshQueueLive)),
  );

  it.effect("runs a fresh submission again after the previous job completed", () =>
    Effect.gen(function* () {
      const queue = yield* RefreshQueue;
      let runs = 0;
      const job = Effect.sync(() => {
        runs += 1;
        return runs;
      });
      expect(yield* queue.submit("custodian", job)).toBe(1);
      expect(yield* queue.submit("custodian", job)).toBe(2);
    }).pipe(Effect.provide(RefreshQueueLive)),
  );

  it.effect("propagates a failing job's error to its submitter", () =>
    Effect.gen(function* () {
      const queue = yield* RefreshQueue;
      const failure = yield* Effect.flip(
        queue.submit(
          "custodian",
          Effect.fail(new FinanceApiError({ code: "validation", message: "connector exploded" })),
        ),
      );
      expect(failure.message).toBe("connector exploded");
    }).pipe(Effect.provide(RefreshQueueLive)),
  );
});
