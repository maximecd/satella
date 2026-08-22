import { describe, expect, it } from "vite-plus/test";

import { createActivityReporter, type ActivityReporterClock } from "./activity-reporter";

const makeClock = () => {
  let now = 0;
  let callback: (() => void) | undefined;
  let delay = 0;
  let nextTimerHandle = 0;
  const clock: ActivityReporterClock = {
    now: () => now,
    schedule: (next, nextDelay) => {
      callback = next;
      delay = nextDelay;
      nextTimerHandle += 1;
      return nextTimerHandle;
    },
    cancel: () => {
      callback = undefined;
    },
  };
  return {
    clock,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    flush: () => callback?.(),
    delay: () => delay,
  };
};

describe("renderer activity reporter", () => {
  it("sends immediately, then once per interval with the latest activity time", () => {
    const clock = makeClock();
    const sent: number[] = [];
    const reporter = createActivityReporter({
      clock: clock.clock,
      intervalMs: 30,
      send: (at) => sent.push(at),
    });

    reporter.report();
    clock.advance(10);
    reporter.report();
    clock.advance(10);
    reporter.report();
    expect(sent).toEqual([0]);
    expect(clock.delay()).toBe(20);
    clock.advance(10);
    clock.flush();
    expect(sent).toEqual([0, 20]);
  });

  it("stops reporting after disposal", () => {
    const clock = makeClock();
    const sent: number[] = [];
    const reporter = createActivityReporter({
      clock: clock.clock,
      intervalMs: 30,
      send: (at) => sent.push(at),
    });
    reporter.report();
    reporter.dispose();
    clock.advance(30);
    clock.flush();
    expect(sent).toEqual([0]);
  });
});
