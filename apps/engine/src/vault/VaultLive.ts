import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import { Reactivity } from "effect/unstable/reactivity";
import { SqlClient } from "effect/unstable/sql";
import { releaseMarketDataResources } from "../finance/market-data.js";

import {
  DatabaseConfig,
  ProductionMigrations,
  makeSqliteClient,
  runMigrations,
} from "../database/index.js";
import { DATABASE_FILE_NAME, ENVELOPE_FILE_NAME } from "../database/config.js";
import {
  DatabaseHistoryError,
  DatabaseOpenError,
  DatabasePragmaError,
  DatabaseValidationError,
} from "../database/errors.js";
import { claimDatabaseOwnership } from "../database/ownership.js";
import {
  EngineSqliteClientTag,
  makeEncryptedSqliteClient,
  type EngineSqliteClient,
} from "../database/encrypted-client.js";
import { buildContainer, parseContainer, VaultContainerError } from "./container.js";
import { VaultEvents } from "./VaultEvents.js";
import { makeScreenLockDeadline } from "./ScreenLockDeadline.js";
import { ManagedRuntime } from "../runtime/ManagedRuntime.js";
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
  publishAtomically,
  readVaultFile,
  restoreJournalPath,
  restoreStagingDirectory,
  RESTORE_BACKUP_DATABASE_NAME,
  RESTORE_BACKUP_ENVELOPE_NAME,
} from "./transfer.js";
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
  readonly sqlite: EngineSqliteClient;
  screenLock: boolean;
  pinFailures: number;
  pinEntryDisabled: boolean;
  timeoutMinutes: ScreenLockTimeoutMinutes;
}

type Session = { readonly _tag: "Closed" } | ({ readonly _tag: "Open" } & OpenSession);

const fileExists = (path: string) =>
  stat(path).then(
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
    : (() => {
        console.error(
          `[Satella] Vault creation failed (${cause instanceof Error ? cause.constructor.name : Object.prototype.toString.call(cause)})`,
        );
        return new VaultStateError({
          reason: "closed",
          message: "The Vault could not be created.",
        });
      })();

const asStateOnly = (message: string) => (cause: unknown) =>
  cause instanceof VaultStateError
    ? cause
    : new VaultStateError({
        reason: "closed" as const,
        message,
      });

const chosenKdf = () => (process.env["SATELLA_VAULT_KDF"] === "fast" ? FAST_KDF : PRODUCTION_KDF);

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

export const DEVELOPMENT_VAULT_PASSWORD = "password";
export const DEVELOPMENT_SCREEN_LOCK_PIN = "0000";

const pathFileExists = async (path: string) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const sha256File = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

const syncFile = async (path: string) => {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const fsyncDirectory = async (path: string) => {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is best-effort on platforms that reject it.
  }
};

const writeFileDurably = async (path: string, contents: Buffer | string) => {
  const handle = await open(path, "w", 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const transferFailure = (message: string) => (): VaultStateError =>
  new VaultStateError({ reason: "filesystem", message });

interface QuickCheckRow {
  readonly quick_check: string;
}

// SAFETY: PRAGMA quick_check always yields exactly one column, named
// quick_check, whose string value is the database status ("ok" when healthy).
const quickCheckValue = (row: QuickCheckRow): string => row["quick_check"];

// SAFETY: PRAGMA quick_check result rows carry the single column declared above.
const quickCheckPassed = (rows: ReadonlyArray<unknown>): boolean =>
  rows.length > 0 && rows.every((row) => quickCheckValue(row as QuickCheckRow) === "ok");

const quickCheckEffect = (client: EngineSqliteClient) =>
  client`PRAGMA quick_check`.pipe(
    Effect.mapError(
      () =>
        new VaultContainerError({
          reason: "malformed",
          message: "The Vault database failed its integrity check.",
        }),
    ),
  );

const verifyEncryptedDatabase = (path: string, dek: Uint8Array) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const client = yield* makeEncryptedSqliteClient({ filename: path, dek }).pipe(
      Effect.provide(Reactivity.layer),
      Effect.provideService(Scope.Scope, scope),
    );
    const rows = yield* quickCheckEffect(client);
    yield* Scope.close(scope, Exit.void);
    if (!quickCheckPassed(rows)) {
      return yield* new VaultContainerError({
        reason: "malformed",
        message: "The exported Vault database failed its integrity check.",
      });
    }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof VaultContainerError
        ? cause
        : new VaultContainerError({
            reason: "malformed",
            message: "The exported Vault database could not be verified.",
          }),
    ),
  );

const parseContainerEffect = (bytes: Uint8Array) =>
  Effect.try({
    try: () => parseContainer(bytes),
    catch: (cause) =>
      cause instanceof VaultContainerError
        ? cause
        : new VaultContainerError({
            reason: "malformed",
            message: "This file is not a valid Satella Vault export.",
          }),
  });

const commitRestoredVault = (
  vaultConfig: typeof DatabaseConfig.Service,
  stagedDatabasePath: string,
  stagedEnvelopePath: string,
) =>
  Effect.tryPromise({
    try: async () => {
      const journalPath = restoreJournalPath(vaultConfig.dataDirectory);
      const previousDatabase = join(vaultConfig.dataDirectory, RESTORE_BACKUP_DATABASE_NAME);
      const previousEnvelope = join(vaultConfig.dataDirectory, RESTORE_BACKUP_ENVELOPE_NAME);
      await rm(previousDatabase, { force: true });
      await rm(previousEnvelope, { force: true });
      if (await pathFileExists(vaultConfig.databasePath)) {
        await copyFile(vaultConfig.databasePath, previousDatabase);
        await syncFile(previousDatabase);
      }
      if (await pathFileExists(vaultConfig.envelopePath)) {
        await copyFile(vaultConfig.envelopePath, previousEnvelope);
        await syncFile(previousEnvelope);
      }
      await writeFileDurably(
        journalPath,
        JSON.stringify({
          version: 1,
          databaseHash: await sha256File(stagedDatabasePath),
          envelopeHash: await sha256File(stagedEnvelopePath),
        }),
      );
      await rename(stagedDatabasePath, vaultConfig.databasePath);
      await rename(stagedEnvelopePath, vaultConfig.envelopePath);
      await fsyncDirectory(vaultConfig.dataDirectory);
      await rm(journalPath, { force: true });
      await rm(restoreStagingDirectory(vaultConfig.dataDirectory), {
        recursive: true,
        force: true,
      });
      await rm(previousDatabase, { force: true });
      await rm(previousEnvelope, { force: true });
    },
    catch: transferFailure("The restored Vault could not be published."),
  });

export const VaultLive = Layer.effect(
  VaultService,
  Effect.gen(function* () {
    const config = yield* DatabaseConfig;
    const events = yield* VaultEvents;
    const managedRuntime = yield* ManagedRuntime;
    const effectContext = yield* Effect.context<never>();
    const sessionRef = yield* Ref.make<Session>({ _tag: "Closed" });

    const envelopePresent = () => Effect.promise(() => fileExists(config.envelopePath));

    const ensureVaultDirectories = () =>
      Effect.tryPromise({
        try: async () => {
          await mkdir(config.dataDirectory, { mode: 0o700, recursive: true });
          await chmod(config.dataDirectory, 0o700);
          await mkdir(config.backupDirectory, { mode: 0o700, recursive: true });
          await chmod(config.backupDirectory, 0o700);
        },
        catch: asCreateError,
      });

    const currentStatus = () =>
      Effect.gen(function* () {
        const hasEnvelope = yield* envelopePresent();
        const session = yield* Ref.get(sessionRef);
        return statusFrom(hasEnvelope, session);
      });

    const publishStatus = (status: VaultStatus) => managedRuntime.publishVault(status);

    const inactivityDeadline = makeScreenLockDeadline({
      onExpire: () => {
        void Effect.runPromiseWith(effectContext)(
          Effect.gen(function* () {
            const session = yield* Ref.get(sessionRef);
            if (session._tag !== "Open" || session.screenLock) return;
            session.screenLock = true;
            session.pinFailures = 0;
            session.pinEntryDisabled = false;
            yield* publishStatus(yield* currentStatus());
          }),
        );
      },
    });
    yield* Effect.addFinalizer(() => Effect.sync(inactivityDeadline.cancel));

    const openWithDek = (envelope: KeyEnvelope, dek: Uint8Array) =>
      Effect.gen(function* () {
        inactivityDeadline.cancel();
        const previous = yield* Ref.get(sessionRef);
        yield* closeSession(previous);
        if (previous._tag === "Open") yield* events.notifyClosed();
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
          sqlite: client,
          screenLock: false,
          pinFailures: 0,
          pinEntryDisabled: false,
          timeoutMinutes: timeout ?? DEFAULT_SCREEN_LOCK_TIMEOUT_MINUTES,
        };
        yield* Ref.set(sessionRef, open);
        inactivityDeadline.start(open.timeoutMinutes * 60_000);
        yield* events.notifyUnlocked();
        yield* publishStatus(yield* currentStatus());
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

    const service = VaultService.of({
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
          yield* ensureVaultDirectories();
          const created = yield* Effect.tryPromise({
            try: () => createEnvelope(input.password, input.kdf ?? chosenKdf()),
            catch: asCreateError,
          });
          yield* Effect.tryPromise({
            try: () => replaceEnvelope(config.envelopePath, created.envelope),
            catch: asCreateError,
          });
          const session = yield* openWithDek(created.envelope, created.dek);
          yield* writeSecurity(session.sql, input.pin, DEFAULT_SCREEN_LOCK_TIMEOUT_MINUTES);
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
          inactivityDeadline.cancel();
          yield* closeSession(session);
          yield* releaseMarketDataResources();
          yield* Ref.set(sessionRef, { _tag: "Closed" });
          yield* events.notifyClosed();
          const status = yield* currentStatus();
          yield* publishStatus(status);
          return status;
        }),
      lockScreen: () =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          session.screenLock = true;
          session.pinFailures = 0;
          session.pinEntryDisabled = false;
          inactivityDeadline.cancel();
          const status = yield* currentStatus();
          yield* publishStatus(status);
          return status;
        }),
      reportActivity: (activityAt) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          if (!session.screenLock) inactivityDeadline.activity(activityAt);
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
          inactivityDeadline.start(session.timeoutMinutes * 60_000);
          const status = yield* currentStatus();
          yield* publishStatus(status);
          return status;
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
          inactivityDeadline.start(session.timeoutMinutes * 60_000);
          const status = yield* currentStatus();
          yield* publishStatus(status);
          return status;
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
          if (!session.screenLock) inactivityDeadline.start(minutes * 60_000);
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
          inactivityDeadline.cancel();
          yield* closeSession(session);
          yield* releaseMarketDataResources();
          yield* Ref.set(sessionRef, { _tag: "Closed" });
          yield* events.notifyClosed();
          yield* Effect.tryPromise({
            try: () => rm(config.dataDirectory, { recursive: true, force: true }),
            catch: asVaultError("Vault reset failed."),
          });
          yield* ensureVaultDirectories();
          yield* claimDatabaseOwnership(config.dataDirectory);
          const status = yield* currentStatus();
          yield* publishStatus(status);
          return status;
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
      exportVault: (password, destinationPath) =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          yield* Effect.tryPromise({
            try: () => unwrapDatabaseKey(password, session.envelope),
            catch: asUnlockError,
          });
          const stagingRoot = join(config.dataDirectory, "export-staging");
          yield* Effect.tryPromise({
            try: async () => {
              await rm(stagingRoot, { recursive: true, force: true });
              await mkdir(stagingRoot, { mode: 0o700, recursive: true });
            },
            catch: transferFailure("The Vault could not be prepared for export."),
          });
          const backupPath = join(stagingRoot, DATABASE_FILE_NAME);
          yield* session.sqlite.backup(backupPath).pipe(
            Effect.mapError(
              () =>
                new VaultStateError({
                  reason: "filesystem",
                  message: "A consistent copy of the Vault database could not be created.",
                }),
            ),
          );
          yield* verifyEncryptedDatabase(backupPath, session.dek);
          const databaseBytes = yield* Effect.tryPromise({
            try: () => readFile(backupPath),
            catch: transferFailure("The consistent Vault copy could not be read."),
          });
          const container = buildContainer(session.envelope, new Uint8Array(databaseBytes));
          yield* Effect.try({
            try: () => parseContainer(container),
            catch: () =>
              new VaultContainerError({
                reason: "malformed",
                message: "The staged export failed its container validation.",
              }),
          });
          yield* Effect.tryPromise({
            try: () => publishAtomically(destinationPath, container),
            catch: transferFailure("The Vault export file could not be saved."),
          });
          yield* Effect.tryPromise({
            try: () => rm(stagingRoot, { recursive: true, force: true }),
            catch: () => undefined,
          }).pipe(Effect.ignore);
        }),
      restoreVault: (sourcePath, password) =>
        Effect.gen(function* () {
          const statusBefore = yield* currentStatus();
          if (statusBefore.state === "open") {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "vault-open",
                message: "Close the Vault before restoring another one.",
              }),
            );
          }
          const bytes = yield* Effect.tryPromise({
            try: () => readVaultFile(sourcePath),
            catch: transferFailure("The selected Vault export could not be read."),
          });
          const parsed = yield* parseContainerEffect(bytes);
          const dek = yield* Effect.tryPromise({
            try: () => unwrapDatabaseKey(password, parsed.envelope),
            catch: asUnlockError,
          });

          const stagingRoot = restoreStagingDirectory(config.dataDirectory);
          const stagedVaultDirectory = join(stagingRoot, "vault");
          yield* Effect.tryPromise({
            try: async () => {
              await rm(stagingRoot, { recursive: true, force: true });
              await mkdir(stagedVaultDirectory, { mode: 0o700, recursive: true });
              await chmod(stagedVaultDirectory, 0o700);
            },
            catch: transferFailure("The restored Vault could not be staged."),
          });
          const stagedDatabasePath = join(stagedVaultDirectory, DATABASE_FILE_NAME);
          const stagedEnvelopePath = join(stagedVaultDirectory, ENVELOPE_FILE_NAME);
          yield* Effect.tryPromise({
            try: async () => {
              const handle = await open(stagedDatabasePath, "w", 0o600);
              try {
                await handle.writeFile(parsed.databaseBytes);
                await handle.sync();
              } finally {
                await handle.close();
              }
            },
            catch: transferFailure("The staged Vault database could not be written."),
          });
          yield* Effect.tryPromise({
            try: () => replaceEnvelope(stagedEnvelopePath, parsed.envelope),
            catch: transferFailure("The staged Vault envelope could not be written."),
          });

          const scope = yield* Scope.make();
          const stagedClient = yield* makeEncryptedSqliteClient({
            filename: stagedDatabasePath,
            dek,
          }).pipe(
            Effect.provide(Reactivity.layer),
            Effect.provideService(Scope.Scope, scope),
            Effect.mapError(
              () =>
                new VaultContainerError({
                  reason: "malformed",
                  message: "The exported database is damaged or was encrypted differently.",
                }),
            ),
          );
          yield* quickCheckEffect(stagedClient).pipe(
            Effect.filterOrFail(
              (rows) => quickCheckPassed(rows),
              () =>
                new VaultContainerError({
                  reason: "malformed",
                  message: "The exported database failed its integrity check.",
                }),
            ),
            Effect.mapError(
              () =>
                new VaultContainerError({
                  reason: "malformed",
                  message: "The exported database failed its integrity check.",
                }),
            ),
          );
          const stagingConfig: typeof DatabaseConfig.Service = {
            ...config,
            dataDirectory: stagingRoot,
            databasePath: stagedDatabasePath,
            envelopePath: stagedEnvelopePath,
            backupDirectory: join(stagingRoot, "backups"),
            databaseExisted: false,
          };
          yield* runMigrations({ registry: ProductionMigrations }).pipe(
            Effect.provideService(DatabaseConfig, stagingConfig),
            Effect.provideService(SqlClient.SqlClient, stagedClient),
            Effect.provideService(EngineSqliteClientTag, stagedClient),
            Effect.catchIf(
              (error): error is DatabaseHistoryError => error instanceof DatabaseHistoryError,
              (error) =>
                Effect.fail(
                  error.reason === "newer-than-binary"
                    ? new VaultContainerError({
                        reason: "unsupported-version",
                        message:
                          "This export comes from a newer Satella schema and cannot be opened by this version.",
                      })
                    : new VaultContainerError({
                        reason: "malformed",
                        message: "The exported database has an unrecognized migration history.",
                      }),
                ),
            ),
            Effect.mapError((error) =>
              error instanceof VaultContainerError
                ? error
                : error instanceof DatabaseOpenError ||
                    error instanceof DatabasePragmaError ||
                    error instanceof DatabaseValidationError
                  ? new VaultContainerError({
                      reason: "malformed",
                      message: "The exported database is damaged or cannot be verified.",
                    })
                  : new VaultStateError({
                      reason: "filesystem",
                      message: "The exported database could not be prepared for this device.",
                    }),
            ),
          );
          yield* Scope.close(scope, Exit.void);

          yield* commitRestoredVault(config, stagedDatabasePath, stagedEnvelopePath);
          const status = yield* currentStatus();
          yield* publishStatus(status);
          return status;
        }).pipe(
          Effect.mapError((error) => {
            if (
              error instanceof VaultStateError ||
              error instanceof VaultUnlockError ||
              error instanceof VaultContainerError
            ) {
              return error;
            }
            return new VaultStateError({
              reason: "filesystem",
              message: "The Vault could not be restored.",
            });
          }),
        ),
      assertRendererFinanceAccess: () =>
        Effect.gen(function* () {
          const session = yield* requireOpen();
          if (session.screenLock) {
            return yield* Effect.fail(
              new VaultStateError({
                reason: "screen-locked",
                message: "Satella is locked.",
              }),
            );
          }
        }),
      assertOpenVault: () => requireOpen().pipe(Effect.asVoid),
    });
    yield* publishStatus(yield* currentStatus());
    return service;
  }),
);
