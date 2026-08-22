import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  AutoRefreshStatus,
  type AutoRefreshStatus as AutoRefreshStatusType,
} from "../finance/contracts.js";
import type { VaultStatus } from "../vault/Vault.js";

const ManagedVaultStateSchema = Schema.Struct({
  state: Schema.Literals(["absent", "locked", "open"]),
  screenLock: Schema.Boolean,
});

const ManagedOperationalMessageSchema = Schema.Struct({
  type: Schema.Literal("operational-state"),
  autoRefresh: AutoRefreshStatus,
  vault: ManagedVaultStateSchema,
});

export type ManagedVaultState = typeof ManagedVaultStateSchema.Type;

export interface ManagedOperationalState {
  readonly autoRefresh: AutoRefreshStatusType;
  readonly vault: ManagedVaultState;
}

/** Closed operational payload: it deliberately contains no financial data. */
export type ManagedOperationalMessage = typeof ManagedOperationalMessageSchema.Type;

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

type ManagedProcessValue =
  | undefined
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<ManagedProcessValue>
  | { readonly [key: string]: ManagedProcessValue };

/** Decodes the closed IPC schema before any message can affect tray state. */
export const decodeManagedOperationalMessage = (
  value: ManagedProcessValue,
): ManagedOperationalMessage | undefined => {
  const decoded = Schema.decodeUnknownOption(ManagedOperationalMessageSchema, {
    onExcessProperty: "error",
  })(value);
  return Option.isSome(decoded) ? decoded.value : undefined;
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
  if (process.send === undefined || process.channel === undefined) return undefined;
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
