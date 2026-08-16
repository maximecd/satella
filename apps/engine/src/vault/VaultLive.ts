import { randomBytes } from "node:crypto";
import { access, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import { Reactivity } from "effect/unstable/reactivity";
import { SqlClient } from "effect/unstable/sql";

import {
  DatabaseConfig,
  ProductionMigrations,
  makeSqliteClient,
  runMigrations,
} from "../database/index.js";
import { EngineSqliteClientTag } from "../database/encrypted-client.js";
import {
  createEnvelope,
  loadEnvelope,
  replaceEnvelope,
  unwrapDatabaseKey,
  wrapDatabaseKey,
  VaultUnlockError,
  type KeyEnvelope,
} from "./envelope.js";
import { VaultStateError } from "./errors.js";
import { FAST_KDF, PRODUCTION_KDF } from "./kdf.js";
import {
  DEFAULT_SCREEN_LOCK_TIMEOUT_MINUTES,
  isFourDigitPin,
  MAX_PIN_ATTEMPTS,
  MIN_VAULT_PASSWORD_LENGTH,
  newPinSalt,
  pinHash,
  RESET_CONFIRMATION,
  SCREEN_LOCK_TIMEOUTS,
  VaultService,
  type ScreenLockTimeoutMinutes,
  type VaultStatus,
} from "./Vault.js";

interface SecurityRow {
  readonly pin_salt: string;
  readonly pin_hash: string;
  readonly screen_lock_timeout_minutes: number;
}

interface OpenSession {
  envelope: KeyEnvelope;
  readonly dek: Uint8Array;
  readonly scope: Scope.Closeable;
  readonly sql: SqlClient.SqlClient;
  screenLock: boolean;
  pinFailures: number;
  pinEntryDisabled: boolean;
  timeoutMinutes: ScreenLockTimeoutMinutes;
}

type Session = { readonly _tag: "Closed" } | ({ readonly _tag: "Open" } & OpenSession);

const fileExists = (path: string) =>
  access(path, fsConstants.F_OK).then(
    () => true,
    () => false,
  );

const asUnlockError = (cause: unknown) =>
  cause instanceof VaultUnlockError
    ? cause
    : new VaultUnlockError({ message: "The Vault could not be unlocked." });

const asVaultError = (message: string) => (cause: unknown) =>
  cause instanceof VaultStateError || cause instanceof VaultUnlockError
    ? cause
    : new VaultStateError({
        reason: "closed" as const,
        message,
      });

const asCreateError = (cause: unknown) =>
  cause instanceof VaultStateError || cause instanceof VaultUnlockError
    ? cause
    : new VaultStateError({
        reason: "closed",
        message: "The Vault could not be created.",
      });

const asStateOnly = (message: string) => (cause: unknown) =>
  cause instanceof VaultStateError
    ? cause
    : new VaultStateError({
        reason: "closed" as const,
        message,
      });

const chosenKdf = () =>
  process.env["OPTIMUS_VAULT_KDF"] === "fast" ? FAST_KDF : PRODUCTION_KDF;

const requirePassword = (password: string) => {
  if (password.length < MIN_VAULT_PASSWORD_LENGTH) {
    return Effect.fail(
      new VaultStateError({
        reason: "password-too-short",
        message: `Vault password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters.`,
      }),
    );
  }
  return Effect.void;
};

const requirePin = (pin: string) => {
  if (!isFourDigitPin(pin)) {
    return Effect.fail(
      new VaultStateError({
        reason: "invalid-pin",
        message: "Screen-lock PIN must be exactly four digits.",
      }),
    );
  }
  return Effect.void;
};

const statusFrom = (hasEnvelope: boolean, session: Session): VaultStatus => {
  if (!hasEnvelope) return { state: "absent" };
  if (session._tag !== "Open") return { state: "locked" };
  return {
    state: "open",
    screenLock: session.screenLock,
    pinAttemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - session.pinFailures),
    pinEntryDisabled: session.pinEntryDisabled,
    screenLockTimeoutMinutes: session.timeoutMinutes,
  };
};

const loadSecurity = (sql: SqlClient.SqlClient) =>
  sql<SecurityRow>`SELECT pin_salt, pin_hash, screen_lock_timeout_minutes FROM vault_security WHERE id = 1`.pipe(
    Effect.map((rows) => rows[0]),
  );

const writeSecurity = (
  sql: SqlClient.SqlClient,
  pin: string,
  timeout: ScreenLockTimeoutMinutes,
) => {
  const salt = newPinSalt();
  const timestamp = new Date().toISOString();
  return sql`INSERT INTO vault_security (id, pin_salt, pin_hash, screen_lock_timeout_minutes, created_at, updated_at)
    VALUES (1, ${salt.toString("base64")}, ${pinHash(pin, salt)}, ${timeout}, ${timestamp}, ${timestamp})
    ON CONFLICT(id) DO UPDATE SET
      pin_salt = excluded.pin_salt,
      pin_hash = excluded.pin_hash,
      screen_lock_timeout_minutes = excluded.screen_lock_timeout_minutes,
      updated_at = excluded.updated_at`;
};

const closeSession = (session: Session) => {
  if (session._tag !== "Open") return Effect.void;
  session.dek.fill(0);
  return Scope.close(session.scope, Exit.void);
};

export const DEVELOPMENT_VAULT_PASSWORD = "optimus-dev-vault";
export const DEVELOPMENT_SCREEN_LOCK_PIN = "0000";

export const VaultLive = Layer.effect(
  VaultService,
  Effect.gen(function* () {
    const config = yield* DatabaseConfig;
    const sessionRef = yield* Ref.make<Session>({ _tag: "Closed" });

    const envelopePresent = () => Effect.promise(() => fileExists(config.envelopePath));

    const currentStatus = () =>
      Effect.gen(function* () {
        const hasEnvelope = yield* envelopePresent();
        const session = yield* Ref.get(sessionRef);
        return statusFrom(hasEnvelope, session);
      });

    const openWithDek = (envelope: KeyEnvelope, dek: Uint8Array) =>
      Effect.gen(function* () {
        yield* Ref.get(sessionRef).pipe(Effect.flatMap(closeSession));
        const scope = yield* Scope.make();
        const client = yield* makeSqliteClient(config, dek).pipe(
          Effect.provide(Reactivity.layer),
          Effect.provideService(Scope.Scope, scope),
        );
        yield* runMigrations({ registry: ProductionMigrations }).pipe(
          Effect.provideService(DatabaseConfig, config),
          Effect.provideService(SqlClient.SqlClient, client),
          Effect.provideService(EngineSqliteClientTag, client),
        );
        const security = yield* loadSecurity(client);
        const timeout = SCREEN_LOCK_TIMEOUTS.find(
          (value) => value === security?.screen_lock_timeout_minutes,
        );
        const open: Session = {
          _tag: "Open",
          envelope,
          dek,
          scope,
          sql: client,
          screenLock: false,
          pinFailures: 0,
          pinEntryDisabled: false,
          timeoutMinutes: timeout ?? DEFAULT_SCREEN_LOCK_TIMEOUT_MINUTES,
        };
        yield* Ref.set(sessionRef, open);
        return open;
      });

    const requireOpen = () =>
      Ref.get(sessionRef).pipe(
        Effect.flatMap((session) =>
          session._tag === "Open"
            ? Effect.succeed(session)
            : Effect.fail(
                new VaultStateError({
                  reason: "closed",
                  message: "The Vault is closed.",
                }),
              ),
        ),
      );

    return VaultService.of({
      status: currentStatus,
      initialize: (input) =>
        Effect.gen(function* () {
          if (yield* envelopePresent()) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "already-exists",
                message: "A Vault already exists on this device.",
              }),
            );
          }
          yield* requirePassword(input.password);
          yield* requirePin(input.pin);
          const created = yield* Effect.tryPromise({
            try: () => createEnvelope(input.password, input.kdf ?? chosenKdf()),
            catch: asCreateError,
          });
          yield* Effect.tryPromise({
            try: () => replaceEnvelope(config.envelopePath, created.envelope),
            catch: asCreateError,
          });
          const session = yield* openWithDek(created.envelope, created.dek);
          yield* writeSecurity(
            session.sql,
            input.pin,
            DEFAULT_SCREEN_LOCK_TIMEOUT_MINUTES,
          );
          return yield* currentStatus();
        }).pipe(
          Effect.mapError((error) =>
            error instanceof VaultStateError || error instanceof VaultUnlockError
              ? error
              : new VaultStateError({
                  reason: "closed",
                  message: "The Vault could not be created.",
                }),
          ),
        ),
      unlock: (password) =>
        Effect.gen(function* () {
          if (!(yield* envelopePresent())) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "absent",
                message: "The Vault could not be unlocked.",
              }),
            );
          }
          const envelope = yield* Effect.tryPromise({
            try: () => loadEnvelope(config.envelopePath),
            catch: asUnlockError,
          });
          const dek = yield* Effect.tryPromise({
            try: () => unwrapDatabaseKey(password, envelope),
            catch: asUnlockError,
          });
          yield* openWithDek(envelope, dek);
          return yield* currentStatus();
        }).pipe(
          Effect.mapError((error) =>
            error instanceof VaultStateError || error instanceof VaultUnlockError
              ? error
              : new VaultUnlockError({ message: "The Vault could not be unlocked." }),
          ),
        ),
      close: () =>
        Effect.gen(function* () {
          const session = yield* Ref.get(sessionRef);
          yield* closeSession(session);
          yield* Ref.set(sessionRef, { _tag: "Closed" });
          return yield* currentStatus();
        }),
      lockScreen: () =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          session.screenLock = true;
          session.pinFailures = 0;
          session.pinEntryDisabled = false;
          return yield* currentStatus();
        }),
      unlockScreen: (pin) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          if (!session.screenLock) return yield* currentStatus();
          if (session.pinEntryDisabled) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "pin-disabled",
                message: "Enter the Vault password to dismiss the Screen lock.",
              }),
            );
          }
          yield* requirePin(pin);
          const security = yield* loadSecurity(session.sql);
          if (security === undefined) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "invalid-pin",
                message: "The Screen-lock PIN is incorrect.",
              }),
            );
          }
          const salt = Buffer.from(security.pin_salt, "base64");
          if (pinHash(pin, salt) !== security.pin_hash) {
            session.pinFailures += 1;
            if (session.pinFailures >= MAX_PIN_ATTEMPTS) {
              session.pinEntryDisabled = true;
            }
            return yield* Effect.fail(
              new VaultStateError({
                reason: "invalid-pin",
                message: "The Screen-lock PIN is incorrect.",
              }),
            );
          }
          session.screenLock = false;
          session.pinFailures = 0;
          session.pinEntryDisabled = false;
          return yield* currentStatus();
        }).pipe(Effect.mapError(asStateOnly("The Screen lock could not be dismissed."))),
      unlockScreenWithPassword: (password) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          yield* Effect.tryPromise({
            try: () => unwrapDatabaseKey(password, session.envelope),
            catch: asUnlockError,
          });
          session.screenLock = false;
          session.pinFailures = 0;
          session.pinEntryDisabled = false;
          return yield* currentStatus();
        }),
      changePassword: (current, next) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          yield* requirePassword(next);
          yield* Effect.tryPromise({
            try: () => unwrapDatabaseKey(current, session.envelope),
            catch: asUnlockError,
          });
          const nextEnvelope = yield* Effect.tryPromise({
            try: () =>
              wrapDatabaseKey(
                next,
                session.dek,
                { ...chosenKdf(), salt: randomBytes(16) },
                session.envelope.vaultId,
              ),
            catch: asUnlockError,
          });
          yield* Effect.tryPromise({
            try: () => replaceEnvelope(config.envelopePath, nextEnvelope),
            catch: asVaultError("The Vault password could not be changed."),
          });
          session.envelope = nextEnvelope;
        }),
      changePin: (password, pin) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          yield* requirePin(pin);
          yield* Effect.tryPromise({
            try: () => unwrapDatabaseKey(password, session.envelope),
            catch: asUnlockError,
          });
          yield* writeSecurity(session.sql, pin, session.timeoutMinutes);
        }).pipe(Effect.mapError(asVaultError("The Screen-lock PIN could not be changed."))),
      setScreenLockTimeout: (minutes) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          if (!SCREEN_LOCK_TIMEOUTS.includes(minutes)) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "invalid-pin",
                message: "Screen-lock timeout must be 5, 15, 30, or 60 minutes.",
              }),
            );
          }
          const timestamp = new Date().toISOString();
          yield* session.sql`UPDATE vault_security SET screen_lock_timeout_minutes = ${minutes}, updated_at = ${timestamp} WHERE id = 1`;
          session.timeoutMinutes = minutes;
        }).pipe(Effect.mapError(asStateOnly("The Screen-lock timeout could not be saved."))),
      verifyPassword: (password) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          yield* Effect.tryPromise({
            try: () => unwrapDatabaseKey(password, session.envelope),
            catch: asUnlockError,
          });
        }),
      reset: (confirmation) =>
        Effect.gen(function* () {
          if (confirmation !== RESET_CONFIRMATION) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "reset-confirmation",
                message: `Type ${RESET_CONFIRMATION} to confirm.`,
              }),
            );
          }
          const session = yield* Ref.get(sessionRef);
          yield* closeSession(session);
          yield* Ref.set(sessionRef, { _tag: "Closed" });
          yield* Effect.tryPromise({
            try: () => rm(config.dataDirectory, { recursive: true, force: true }),
            catch: asVaultError("Vault reset failed."),
          });
          return yield* currentStatus();
        }).pipe(
          Effect.mapError((error) =>
            error instanceof VaultStateError
              ? error
              : new VaultStateError({
                  reason: "closed",
                  message: "Vault reset failed.",
                }),
          ),
        ),
      currentSql: () => requireOpen().pipe(Effect.map((session) => session.sql)),
      assertRendererFinanceAccess: () =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          if (session.screenLock) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "screen-locked",
                message: "Optimus is locked.",
              }),
            );
          }
        }),
      assertOpenVault: () => requireOpen().pipe(Effect.asVoid),
    });
  }),
);
