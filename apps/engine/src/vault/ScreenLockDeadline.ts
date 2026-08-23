export type ScreenLockTimerHandle = ReturnType<typeof setTimeout> | number;

export interface ScreenLockDeadlineClock {
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => ScreenLockTimerHandle;
  readonly cancel: (handle: ScreenLockTimerHandle) => void;
}

export interface ScreenLockDeadline {
  readonly start: (timeoutMs: number, activityAt?: number) => void;
  readonly activity: (activityAt?: number) => void;
  readonly cancel: () => void;
  readonly deadline: () => number | null;
}

const realClock: ScreenLockDeadlineClock = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

const safeActivityTime = (now: number, activityAt: number | undefined) => {
  if (activityAt === undefined || !Number.isFinite(activityAt)) return now;
  return Math.min(now, Math.max(0, activityAt));
};

/** One cancellable inactivity deadline; it never polls while the Vault is open. */
export const makeScreenLockDeadline = (options: {
  readonly onExpire: () => void;
  readonly clock?: ScreenLockDeadlineClock;
}): ScreenLockDeadline => {
  const clock = options.clock ?? realClock;
  let timeoutMs: number | null = null;
  let lastActivityAt: number | null = null;
  let scheduled: ScreenLockTimerHandle | undefined;
  let generation = 0;

  const cancel = () => {
    generation += 1;
    if (scheduled !== undefined) {
      clock.cancel(scheduled);
      scheduled = undefined;
    }
    timeoutMs = null;
    lastActivityAt = null;
  };

  const schedule = () => {
    if (timeoutMs === null || lastActivityAt === null) return;
    if (scheduled !== undefined) clock.cancel(scheduled);
    const expectedGeneration = generation;
    const dueAt = lastActivityAt + timeoutMs;
    scheduled = clock.schedule(
      () => {
        scheduled = undefined;
        if (expectedGeneration !== generation || timeoutMs === null || lastActivityAt === null)
          return;
        if (clock.now() < dueAt) {
          schedule();
          return;
        }
        timeoutMs = null;
        lastActivityAt = null;
        options.onExpire();
      },
      Math.max(0, dueAt - clock.now()),
    );
  };

  const start = (nextTimeoutMs: number, activityAt?: number) => {
    cancel();
    timeoutMs = Math.max(0, nextTimeoutMs);
    lastActivityAt = safeActivityTime(clock.now(), activityAt);
    schedule();
  };

  const activity = (activityAt?: number) => {
    if (timeoutMs === null) return;
    const now = clock.now();
    const nextActivityAt = safeActivityTime(now, activityAt);
    lastActivityAt = Math.max(lastActivityAt ?? nextActivityAt, nextActivityAt);
    generation += 1;
    schedule();
  };

  return {
    start,
    activity,
    cancel,
    deadline: () =>
      timeoutMs === null || lastActivityAt === null ? null : lastActivityAt + timeoutMs,
  };
};
