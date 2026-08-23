export const ACTIVITY_REPORT_INTERVAL_MS = 30_000;

export type ActivityTimerHandle = ReturnType<typeof setTimeout> | number;

export interface ActivityReporterClock {
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => ActivityTimerHandle;
  readonly cancel: (handle: ActivityTimerHandle) => void;
}

export interface ActivityReporter {
  readonly report: () => void;
  readonly dispose: () => void;
}

const realClock: ActivityReporterClock = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

/** Coalesces pointer and keyboard activity while preserving the latest event time. */
export const createActivityReporter = (options: {
  readonly send: (activityAt: number) => void;
  readonly clock?: ActivityReporterClock;
  readonly intervalMs?: number;
}): ActivityReporter => {
  const clock = options.clock ?? realClock;
  const intervalMs = options.intervalMs ?? ACTIVITY_REPORT_INTERVAL_MS;
  let lastSentAt: number | undefined;
  let pendingActivityAt: number | undefined;
  let timer: ActivityTimerHandle | undefined;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== undefined) {
      clock.cancel(timer);
      timer = undefined;
    }
  };

  const flush = () => {
    if (disposed || pendingActivityAt === undefined) return;
    const activityAt = pendingActivityAt;
    pendingActivityAt = undefined;
    clearTimer();
    lastSentAt = clock.now();
    options.send(activityAt);
  };

  const report = () => {
    if (disposed) return;
    const now = clock.now();
    pendingActivityAt = Math.max(pendingActivityAt ?? now, now);
    if (lastSentAt === undefined || now - lastSentAt >= intervalMs) {
      flush();
      return;
    }
    if (timer === undefined) {
      timer = clock.schedule(() => flush(), Math.max(0, intervalMs - (now - lastSentAt)));
    }
  };

  return {
    report,
    dispose: () => {
      disposed = true;
      pendingActivityAt = undefined;
      clearTimer();
    },
  };
};
