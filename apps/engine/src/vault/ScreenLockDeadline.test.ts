import { describe, expect, it } from "vite-plus/test";

import { makeScreenLockDeadline, type ScreenLockDeadlineClock } from "./ScreenLockDeadline.js";

const makeTestClock = () => {
  let now = 0;
  let nextHandle = 0;
  const timers = new Map<number, { readonly at: number; readonly callback: () => void }>();
  const clock: ScreenLockDeadlineClock = {
    now: () => now,
    schedule: (callback, delayMs) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { at: now + delayMs, callback });
      return handle;
    },
    cancel: (handle) => timers.delete(handle as number),
  };
  return {
    clock,
    advance: (milliseconds: number) => {
      now += milliseconds;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= now);
      for (const [handle, timer] of due) {
        timers.delete(handle);
        timer.callback();
      }
    },
  };
};

describe("Screen-lock inactivity deadline", () => {
  it("uses one cancellable deadline and postpones it on activity", () => {
    const testClock = makeTestClock();
    let expirations = 0;
    const deadline = makeScreenLockDeadline({
      clock: testClock.clock,
      onExpire: () => {
        expirations += 1;
      },
    });

    deadline.start(100);
    expect(deadline.deadline()).toBe(100);
    testClock.advance(90);
    deadline.activity();
    expect(deadline.deadline()).toBe(190);
    testClock.advance(99);
    expect(expirations).toBe(0);
    testClock.advance(1);
    expect(expirations).toBe(1);
    expect(deadline.deadline()).toBeNull();
  });

  it("cancels the deadline without affecting a later start", () => {
    const testClock = makeTestClock();
    let expirations = 0;
    const deadline = makeScreenLockDeadline({
      clock: testClock.clock,
      onExpire: () => {
        expirations += 1;
      },
    });

    deadline.start(100);
    deadline.cancel();
    testClock.advance(1_000);
    expect(expirations).toBe(0);
    expect(deadline.deadline()).toBeNull();

    deadline.start(50, 1_000);
    expect(deadline.deadline()).toBe(1_050);
    testClock.advance(50);
    expect(expirations).toBe(1);
  });
});
