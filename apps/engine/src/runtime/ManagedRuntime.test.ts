import { spawn } from "node:child_process";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  decodeManagedOperationalMessage,
  make,
  type ManagedOperationalMessage,
  type ManagedProcessChannel,
} from "./ManagedRuntime.js";

const status = (lastCycleAt: string | null) => ({
  lastCycleAt,
  lastCycleOutcome: lastCycleAt === null ? null : ("success" as const),
});

describe("managed runtime channel", () => {
  it("coalesces operational state to the newest unsent value", async () => {
    const sent: ManagedOperationalMessage[] = [];
    const callbacks: Array<() => void> = [];
    let connected = true;
    const channel: ManagedProcessChannel = {
      connected: () => connected,
      send: (message, callback) => {
        sent.push(message);
        callbacks.push(callback);
      },
      onDisconnect: () => () => undefined,
    };
    const runtime = await Effect.runPromise(Effect.scoped(make(channel)));

    await Effect.runPromise(runtime.publishAutoRefresh(status("2026-08-22T12:00:00.000Z")));
    await Effect.runPromise(
      runtime.publishVault({
        state: "open",
        screenLock: false,
        pinAttemptsRemaining: 3,
        pinEntryDisabled: false,
        screenLockTimeoutMinutes: 5,
      }),
    );
    await Effect.runPromise(runtime.publishAutoRefresh(status("2026-08-22T12:01:00.000Z")));
    expect(sent).toHaveLength(1);
    callbacks[0]?.();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.autoRefresh.lastCycleAt).toBe("2026-08-22T12:01:00.000Z");
    connected = false;
  });

  it("rejects operational messages with financial or unknown fields", () => {
    const valid = {
      type: "operational-state",
      autoRefresh: status(null),
      vault: { state: "locked", screenLock: false },
    };
    expect(decodeManagedOperationalMessage(valid)).toEqual(valid);
    expect(
      decodeManagedOperationalMessage({
        ...valid,
        positions: [{ assetId: "secret" }],
      }),
    ).toBeUndefined();
    expect(
      decodeManagedOperationalMessage({
        ...valid,
        vault: { ...valid.vault, pinAttemptsRemaining: 2 },
      }),
    ).toBeUndefined();
  });

  it("observes closure of a real child-process IPC channel", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const channel: ManagedProcessChannel = {
      connected: () => child.connected,
      send: (message, callback) => child.send(message, callback),
      onDisconnect: (listener) => {
        child.once("disconnect", listener);
        return () => child.removeListener("disconnect", listener);
      },
    };

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* make(channel);
            yield* Effect.sync(() => child.disconnect());
            yield* runtime.awaitParentDisconnect();
          }),
        ),
      );
      expect(child.connected).toBe(false);
    } finally {
      child.kill();
    }
  });
});
