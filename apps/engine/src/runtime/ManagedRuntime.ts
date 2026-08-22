import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import type { AutoRefreshStatus } from "../finance/contracts.js";
import type { VaultStatus } from "../vault/Vault.js";

export interface ManagedVaultState {
  readonly state: "absent" | "locked" | "open";
  readonly screenLock: boolean;
}

export interface ManagedOperationalState {
  readonly autoRefresh: AutoRefreshStatus;
  readonly vault: ManagedVaultState;
}

/** Closed operational payload: it deliberately contains no financial data. */
export interface ManagedOperationalMessage {
  readonly type: "operational-state";
  readonly autoRefresh: AutoRefreshStatus;
  readonly vault: ManagedVaultState;
}

export interface ManagedProcessChannel {
  readonly connected: () => boolean;
  readonly send: (message: ManagedOperationalMessage, callback: () => void) => void;
  readonly onDisconnect: (listener: () => void) => () => void;
}

export class ManagedRuntime extends Context.Service<
  ManagedRuntime,
  {
    readonly managed: boolean;
    readonly publishAutoRefresh: (status: AutoRefreshStatus) => Effect.Effect<void>;
    readonly publishVault: (status: VaultStatus) => Effect.Effect<void>;
    readonly awaitParentDisconnect: () => Effect.Effect<void>;
  }
>()("@satella-app/engine/runtime/ManagedRuntime") {}

export const vaultOperationalState = (status: VaultStatus): ManagedVaultState => ({
  state: status.state,
  screenLock: status.state === "open" && status.screenLock,
});

const initialState: ManagedOperationalState = {
  autoRefresh: { lastCycleAt: null, lastCycleOutcome: null },
  vault: { state: "locked", screenLock: false },
};

const messageFor = (state: ManagedOperationalState): ManagedOperationalMessage => ({
  type: "operational-state",
  autoRefresh: state.autoRefresh,
  vault: state.vault,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: ReadonlyArray<string>) => {
  const expected = new Set(keys);
  return (
    Object.keys(value).every((key) => expected.has(key)) &&
    expected.size === Object.keys(value).length
  );
};

/** Decodes the closed IPC schema before any message can affect tray state. */
export const decodeManagedOperationalMessage = (
  value: unknown,
): ManagedOperationalMessage | undefined => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "autoRefresh", "vault"])) return undefined;
  if (value.type !== "operational-state" || !isRecord(value.autoRefresh) || !isRecord(value.vault))
    return undefined;
  if (!hasOnlyKeys(value.autoRefresh, ["lastCycleAt", "lastCycleOutcome"])) return undefined;
  if (!hasOnlyKeys(value.vault, ["state", "screenLock"])) return undefined;
  const { lastCycleAt, lastCycleOutcome } = value.autoRefresh;
  if (lastCycleAt !== null && typeof lastCycleAt !== "string") return undefined;
  if (
    lastCycleOutcome !== null &&
    lastCycleOutcome !== "success" &&
    lastCycleOutcome !== "partial" &&
    lastCycleOutcome !== "failed"
  )
    return undefined;
  if (
    value.vault.state !== "absent" &&
    value.vault.state !== "locked" &&
    value.vault.state !== "open"
  )
    return undefined;
  if (typeof value.vault.screenLock !== "boolean") return undefined;
  return value as unknown as ManagedOperationalMessage;
};

const sameState = (left: ManagedOperationalState, right: ManagedOperationalState) =>
  left.autoRefresh.lastCycleAt === right.autoRefresh.lastCycleAt &&
  left.autoRefresh.lastCycleOutcome === right.autoRefresh.lastCycleOutcome &&
  left.vault.state === right.vault.state &&
  left.vault.screenLock === right.vault.screenLock;

const noOp = ManagedRuntime.of({
  managed: false,
  publishAutoRefresh: () => Effect.void,
  publishVault: () => Effect.void,
  awaitParentDisconnect: () => Effect.never,
});

/** Builds the managed or standalone runtime adapter at the process boundary. */
export const make = (channel?: ManagedProcessChannel) =>
  Effect.gen(function* () {
    if (channel === undefined) return noOp;

    const disconnected = yield* Deferred.make<void>();
    const removeDisconnectListener = channel.onDisconnect(() => {
      Deferred.doneUnsafe(disconnected, Exit.void);
    });
    yield* Effect.addFinalizer(() => Effect.sync(removeDisconnectListener));
    if (!channel.connected()) Deferred.doneUnsafe(disconnected, Exit.void);

    let state = initialState;
    let pending: ManagedOperationalMessage | undefined;
    let sending = false;

    const flush = () => {
      if (sending || pending === undefined || !channel.connected()) return;
      const message = pending;
      pending = undefined;
      sending = true;
      try {
        channel.send(message, () => {
          sending = false;
          flush();
        });
      } catch {
        sending = false;
      }
    };

    const publish = (next: ManagedOperationalState) =>
      Effect.sync(() => {
        if (sameState(state, next)) return;
        state = next;
        pending = messageFor(next);
        flush();
      });

    return ManagedRuntime.of({
      managed: true,
      publishAutoRefresh: (status) => publish({ ...state, autoRefresh: status }),
      publishVault: (status) => publish({ ...state, vault: vaultOperationalState(status) }),
      awaitParentDisconnect: () => Deferred.await(disconnected),
    });
  });

const nodeChannel = (): ManagedProcessChannel | undefined => {
  if (typeof process.send !== "function" || process.channel === undefined) return undefined;
  return {
    connected: () => process.connected === true,
    send: (message, callback) => {
      process.send?.(message, () => callback());
    },
    onDisconnect: (listener) => {
      process.once("disconnect", listener);
      return () => process.removeListener("disconnect", listener);
    },
  };
};

export const layer = (channel: ManagedProcessChannel | undefined = nodeChannel()) =>
  Layer.effect(ManagedRuntime, make(channel));
