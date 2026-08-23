import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { EngineApi } from "./Api.js";
import { VaultApiError } from "../vault/contracts.js";
import { VaultContainerError } from "../vault/container.js";
import { VaultUnlockError } from "../vault/envelope.js";
import { VaultStateError } from "../vault/errors.js";
import { VaultService } from "../vault/Vault.js";

const toApiError = (cause: unknown): VaultApiError => {
  if (cause instanceof VaultApiError) return cause;
  if (cause instanceof VaultContainerError) {
    return new VaultApiError({
      code: cause.reason === "unsupported-version" ? "unsupported-container" : "invalid-container",
      message: cause.message,
    });
  }
  if (cause instanceof VaultUnlockError) {
    return new VaultApiError({ code: "unlock-failed", message: cause.message });
  }
  if (cause instanceof VaultStateError) {
    const code =
      cause.reason === "already-exists"
        ? "already-exists"
        : cause.reason === "absent"
          ? "absent"
          : cause.reason === "password-too-short"
            ? "password-too-short"
            : cause.reason === "invalid-pin"
              ? "invalid-pin"
              : cause.reason === "pin-disabled"
                ? "pin-disabled"
                : cause.reason === "screen-locked"
                  ? "screen-locked"
                  : cause.reason === "reset-confirmation"
                    ? "reset-confirmation"
                    : cause.reason === "vault-open"
                      ? "vault-open"
                      : cause.reason === "filesystem"
                        ? "filesystem"
                        : cause.reason === "closed"
                          ? "closed"
                          : "validation";
    return new VaultApiError({ code, message: cause.message });
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
    .handle("reportActivity", ({ payload }) =>
      run(
        Effect.gen(function* () {
          yield* (yield* VaultService).reportActivity(payload.activityAt);
        }),
      ),
    )
    .handle("reset", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).reset(payload.confirmation);
        }),
      ),
    )
    .handle("exportVault", ({ payload }) =>
      run(
        Effect.gen(function* () {
          const vault = yield* VaultService;
          yield* vault.exportVault(payload.password, payload.destinationPath);
          return yield* vault.status();
        }),
      ),
    )
    .handle("restoreVault", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).restoreVault(payload.sourcePath, payload.password);
        }),
      ),
    ),
);
