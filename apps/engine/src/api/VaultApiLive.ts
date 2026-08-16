import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { EngineApi } from "./Api.js";
import { VaultApiError } from "../vault/contracts.js";
import { VaultUnlockError } from "../vault/envelope.js";
import { VaultStateError } from "../vault/errors.js";
import { VaultService } from "../vault/Vault.js";

const toApiError = (error: unknown): VaultApiError => {
  if (error instanceof VaultApiError) return error;
  if (error instanceof VaultUnlockError) {
    return new VaultApiError({ code: "unlock-failed", message: error.message });
  }
  if (error instanceof VaultStateError) {
    const code =
      error.reason === "already-exists"
        ? "already-exists"
        : error.reason === "absent"
          ? "absent"
          : error.reason === "password-too-short"
            ? "password-too-short"
            : error.reason === "invalid-pin"
              ? "invalid-pin"
              : error.reason === "pin-disabled"
                ? "pin-disabled"
                : error.reason === "screen-locked"
                  ? "screen-locked"
                  : error.reason === "reset-confirmation"
                    ? "reset-confirmation"
                    : error.reason === "closed"
                      ? "closed"
                      : "validation";
    return new VaultApiError({ code, message: error.message });
  }
  return new VaultApiError({
    code: "unlock-failed",
    message: "The Vault could not be unlocked.",
  });
};

const run = <A>(effect: Effect.Effect<A, unknown, VaultService>) =>
  effect.pipe(Effect.mapError(toApiError));

export const VaultApiLive = HttpApiBuilder.group(EngineApi, "vault", (handlers) =>
  handlers
    .handle("status", () =>
      Effect.gen(function* () {
        return yield* (yield* VaultService).status();
      }),
    )
    .handle("initialize", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).initialize(payload);
        }),
      ),
    )
    .handle("unlock", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).unlock(payload.password);
        }),
      ),
    )
    .handle("close", () =>
      Effect.gen(function* () {
        return yield* (yield* VaultService).close();
      }),
    )
    .handle("lockScreen", () =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).lockScreen();
        }),
      ),
    )
    .handle("unlockScreen", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).unlockScreen(payload.pin);
        }),
      ),
    )
    .handle("unlockScreenWithPassword", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).unlockScreenWithPassword(payload.password);
        }),
      ),
    )
    .handle("changePassword", ({ payload }) =>
      run(
        Effect.gen(function* () {
          yield* (yield* VaultService).changePassword(
            payload.currentPassword,
            payload.nextPassword,
          );
        }),
      ),
    )
    .handle("changePin", ({ payload }) =>
      run(
        Effect.gen(function* () {
          yield* (yield* VaultService).changePin(payload.password, payload.pin);
        }),
      ),
    )
    .handle("setScreenLockTimeout", ({ payload }) =>
      run(
        Effect.gen(function* () {
          const vault = yield* VaultService;
          yield* vault.setScreenLockTimeout(payload.minutes);
          return yield* vault.status();
        }),
      ),
    )
    .handle("reset", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).reset(payload.confirmation);
        }),
      ),
    ),
);
