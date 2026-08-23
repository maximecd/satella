import { createHmac, randomBytes } from "node:crypto";
import * as Context from "effect/Context";
import type { SqlClient } from "effect/unstable/sql";
import type * as Effect from "effect/Effect";

import type { VaultContainerError } from "./container.js";
import type { VaultUnlockError } from "./envelope.js";
import type { VaultStateError } from "./errors.js";
import type { Argon2idParameters } from "./kdf.js";
import type { ScreenLockTimeoutMinutes } from "./constants.js";

export {
  DEFAULT_SCREEN_LOCK_TIMEOUT_MINUTES,
  MAX_PIN_ATTEMPTS,
  MIN_VAULT_PASSWORD_LENGTH,
  RESET_CONFIRMATION,
  SCREEN_LOCK_TIMEOUTS,
} from "./constants.js";
export type { ScreenLockTimeoutMinutes } from "./constants.js";

export type VaultStatus =
  | { readonly state: "absent" }
  | { readonly state: "locked" }
  | {
      readonly state: "open";
      readonly screenLock: boolean;
      readonly pinAttemptsRemaining: number;
      readonly pinEntryDisabled: boolean;
      readonly screenLockTimeoutMinutes: ScreenLockTimeoutMinutes;
    };

export interface InitializeVaultInput {
  readonly password: string;
  readonly pin: string;
  readonly kdf?: Omit<Argon2idParameters, "salt">;
}

export class VaultService extends Context.Service<
  VaultService,
  {
    readonly status: () => Effect.Effect<VaultStatus>;
    readonly initialize: (
      input: InitializeVaultInput,
    ) => Effect.Effect<VaultStatus, VaultStateError | VaultUnlockError>;
    readonly unlock: (
      password: string,
    ) => Effect.Effect<VaultStatus, VaultStateError | VaultUnlockError>;
    readonly close: () => Effect.Effect<VaultStatus>;
    readonly lockScreen: () => Effect.Effect<VaultStatus, VaultStateError>;
    readonly reportActivity: (activityAt?: number) => Effect.Effect<void, VaultStateError>;
    readonly unlockScreen: (pin: string) => Effect.Effect<VaultStatus, VaultStateError>;
    readonly unlockScreenWithPassword: (
      password: string,
    ) => Effect.Effect<VaultStatus, VaultStateError | VaultUnlockError>;
    readonly changePassword: (
      current: string,
      next: string,
    ) => Effect.Effect<void, VaultStateError | VaultUnlockError>;
    readonly changePin: (
      password: string,
      pin: string,
    ) => Effect.Effect<void, VaultStateError | VaultUnlockError>;
    readonly setScreenLockTimeout: (
      minutes: ScreenLockTimeoutMinutes,
    ) => Effect.Effect<void, VaultStateError>;
    readonly verifyPassword: (
      password: string,
    ) => Effect.Effect<void, VaultStateError | VaultUnlockError>;
    readonly reset: (confirmation: string) => Effect.Effect<VaultStatus, VaultStateError>;
    readonly exportVault: (
      password: string,
      destinationPath: string,
    ) => Effect.Effect<void, VaultStateError | VaultUnlockError | VaultContainerError>;
    readonly restoreVault: (
      sourcePath: string,
      password: string,
    ) => Effect.Effect<VaultStatus, VaultStateError | VaultUnlockError | VaultContainerError>;
    readonly currentSql: () => Effect.Effect<SqlClient.SqlClient, VaultStateError>;
    readonly assertRendererFinanceAccess: () => Effect.Effect<void, VaultStateError>;
    readonly assertOpenVault: () => Effect.Effect<void, VaultStateError>;
  }
>()("@satella-app/engine/VaultService") {}

export const pinHash = (pin: string, salt: Uint8Array) =>
  createHmac("sha256", Buffer.from(salt)).update(pin, "utf8").digest("hex");

export const newPinSalt = () => randomBytes(16);

export const isFourDigitPin = (pin: string) => /^\d{4}$/.test(pin);
