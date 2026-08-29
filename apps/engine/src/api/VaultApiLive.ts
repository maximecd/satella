import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EngineApi } from "./Api.js";
import { VaultApiError } from "../vault/contracts.js";
import { VaultContainerError } from "../vault/container.js";
import { VaultUnlockError } from "../vault/envelope.js";
import { VaultStateError } from "../vault/errors.js";
import { VaultService } from "../vault/Vault.js";
import { mcpUrl, parsePort } from "../cli/product-runtime.js";
import { McpTokenService } from "../mcp/McpTokenService.js";
import { FinanceApiError } from "../finance/contracts.js";

const toApiError = (cause: unknown): VaultApiError => {
  if (cause instanceof VaultApiError) return cause;
  if (cause instanceof FinanceApiError) {
    return new VaultApiError({
      code: cause.code === "vault_closed" ? "closed" : "validation",
      message: cause.message,
    });
  }
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
    message: `The Vault request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
  });
};

const mcpEndpoint = () => mcpUrl(parsePort(process.env["SATELLA_ENGINE_PORT"], 3001));

const authorizationHeader = (token: string) => `Authorization: Bearer ${token}`;

const run = <A>(effect: Effect.Effect<A, unknown, VaultService | McpTokenService>) =>
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
    .handle("exportVaultDownload", ({ payload }) =>
      run(
        Effect.gen(function* () {
          const vault = yield* VaultService;
          const fileName = "satella-vault-export.satella-vault";
          const destinationPath = join(
            tmpdir(),
            `satella-export-${randomBytes(8).toString("hex")}`,
          );
          yield* vault.exportVault(payload.password, destinationPath);
          const bytes = yield* Effect.tryPromise({
            try: () => readFile(destinationPath),
            catch: () =>
              new VaultStateError({
                reason: "filesystem",
                message: "The Vault export could not be read for download.",
              }),
          });
          yield* Effect.tryPromise({
            try: () => rm(destinationPath, { force: true }),
            catch: () => undefined,
          }).pipe(Effect.ignore);
          return { fileName, contentsBase64: bytes.toString("base64") };
        }),
      ),
    )
    .handle("restoreVault", ({ payload }) =>
      run(
        Effect.gen(function* () {
          return yield* (yield* VaultService).restoreVault(payload.sourcePath, payload.password);
        }),
      ),
    )
    .handle("restoreVaultUpload", ({ payload }) =>
      run(
        Effect.gen(function* () {
          const vault = yield* VaultService;
          const sourcePath = join(tmpdir(), `satella-restore-${randomBytes(8).toString("hex")}`);
          yield* Effect.tryPromise({
            try: () =>
              writeFile(sourcePath, Buffer.from(payload.contentsBase64, "base64"), { mode: 0o600 }),
            catch: () =>
              new VaultStateError({
                reason: "filesystem",
                message: "The uploaded Vault export could not be staged.",
              }),
          });
          return yield* vault.restoreVault(sourcePath, payload.password).pipe(
            Effect.ensuring(
              Effect.tryPromise({
                try: () => rm(sourcePath, { force: true }),
                catch: () => undefined,
              }).pipe(Effect.ignore),
            ),
          );
        }),
      ),
    )
    .handle("mcpTokenStatus", () =>
      run(
        Effect.gen(function* () {
          const configured = yield* (yield* McpTokenService).configured();
          return { configured, url: mcpEndpoint() };
        }),
      ),
    )
    .handle("issueMcpToken", ({ payload }) =>
      run(
        Effect.gen(function* () {
          const token = yield* (yield* McpTokenService).issue(payload.password);
          const url = mcpEndpoint();
          return { token, url, authorizationHeader: authorizationHeader(token) };
        }),
      ),
    ),
);
