import { describe, expect, it } from "vite-plus/test";

import {
  createWindowLifecycle,
  WINDOW_DORMANCY_GRACE_MS,
  type WindowLifecycleWindow,
} from "./window.js";

const makeWindow = (calls: string[]): WindowLifecycleWindow => ({
  hide: () => calls.push("hide"),
  destroy: () => calls.push("destroy"),
  isMinimized: () => false,
  restore: () => calls.push("restore"),
  show: () => calls.push("show"),
  focus: () => calls.push("focus"),
});

describe("window lifecycle", () => {
  it("keeps an accidental close warm, then releases the renderer after grace", () => {
    const calls: string[] = [];
    let timer: (() => void) | undefined;
    let nextTimerHandle = 0;
    let createRequests = 0;
    const lifecycle = createWindowLifecycle({
      createWindow: () => {
        createRequests += 1;
      },
      isQuitting: () => false,
      schedule: (callback, delayMs) => {
        expect(delayMs).toBe(WINDOW_DORMANCY_GRACE_MS);
        timer = callback;
        nextTimerHandle += 1;
        return nextTimerHandle;
      },
      cancel: () => {
        timer = undefined;
      },
    });
    const window = makeWindow(calls);
    lifecycle.attach(window);

    const event = { preventDefault: () => calls.push("prevent") };
    lifecycle.handleClose(window, event);
    lifecycle.handleClose(window, event);
    expect(lifecycle.state()).toBe("hidden");
    expect(calls).toEqual(["prevent", "hide", "prevent"]);

    expect(lifecycle.open()).toBe("focused");
    expect(lifecycle.state()).toBe("active");
    expect(calls).toEqual(["prevent", "hide", "prevent", "show", "focus"]);
    expect(timer).toBeUndefined();

    lifecycle.handleClose(window, event);
    timer?.();
    expect(lifecycle.state()).toBe("dormant");
    expect(calls.at(-1)).toBe("destroy");
    expect(lifecycle.open()).toBe("create");
    expect(createRequests).toBe(1);
  });

  it("allows a real close while quitting and does not schedule dormancy", () => {
    const calls: string[] = [];
    const lifecycle = createWindowLifecycle({
      createWindow: () => undefined,
      isQuitting: () => true,
      schedule: () => {
        throw new Error("unexpected timer");
      },
    });
    const window = makeWindow(calls);
    lifecycle.attach(window);
    lifecycle.handleClose(window, { preventDefault: () => calls.push("prevent") });
    expect(calls).toEqual([]);
    expect(lifecycle.state()).toBe("active");
  });
});
