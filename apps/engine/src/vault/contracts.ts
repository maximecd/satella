import * as Schema from "effect/Schema";
import { HttpApiSchema } from "effect/unstable/httpapi";

import { SCREEN_LOCK_TIMEOUTS } from "./constants.js";

export class VaultApiError extends Schema.TaggedError<VaultApiError>()(
  "VaultApiError",
  {
    code: Schema.Literals([
      "absent",
      "already-exists",
      "closed",
      "unlock-failed",
      "password-too-short",
      "invalid-pin",
      "pin-disabled",
      "screen-locked",
      "reset-confirmation",
      "validation",
    ]),
    message: Schema.String,
  },
  { httpApiStatus: 400 },
) {}

export const VaultStatus = Schema.Union([
  Schema.Struct({ state: Schema.Literal("absent") }),
  Schema.Struct({ state: Schema.Literal("locked") }),
  Schema.Struct({
    state: Schema.Literal("open"),
    screenLock: Schema.Boolean,
    pinAttemptsRemaining: Schema.Number,
    pinEntryDisabled: Schema.Boolean,
    screenLockTimeoutMinutes: Schema.Literals(SCREEN_LOCK_TIMEOUTS),
  }),
]);
export type VaultStatus = typeof VaultStatus.Type;

export const InitializeVaultInput = Schema.Struct({
  password: Schema.String,
  pin: Schema.String,
});

export const UnlockVaultInput = Schema.Struct({
  password: Schema.String,
});

export const UnlockScreenInput = Schema.Struct({
  pin: Schema.String,
});

export const ChangeVaultPasswordInput = Schema.Struct({
  currentPassword: Schema.String,
  nextPassword: Schema.String,
});

export const ChangeScreenLockPinInput = Schema.Struct({
  password: Schema.String,
  pin: Schema.String,
});

export const ScreenLockTimeoutInput = Schema.Struct({
  minutes: Schema.Literals(SCREEN_LOCK_TIMEOUTS),
});

export const ResetVaultInput = Schema.Struct({
  confirmation: Schema.String,
});
