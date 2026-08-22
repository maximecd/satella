import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { execFile } from "node:child_process";
import { chmod, mkdir, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import { DatabaseConfigError } from "./errors.js";
import { recoverInterruptedRestore } from "../vault/transfer.js";

const execFileAsync = promisify(execFile);

export const DATA_DIRECTORY_ENV = "SATELLA_DATA_DIR";
export const CANONICAL_DATA_DIRECTORY_ENV = "SATELLA_CANONICAL_DATA_DIR";
export const DATABASE_CONTEXT_ENV = "SATELLA_DATABASE_CONTEXT";
export const DEVELOPMENT_DATABASE_CONTEXT = "development";
export const PRODUCTION_DATABASE_CONTEXT = "production";
export const WORKTREE_DATA_DIRECTORY_NAME = ".satella";
export const ENVELOPE_FILE_NAME = "vault.envelope.json";
export const DATABASE_FILE_NAME = "satella.sqlite";

export class DatabaseConfig extends Context.Service<
  DatabaseConfig,
  {
    readonly dataDirectory: string;
    readonly databasePath: string;
    readonly envelopePath: string;
    readonly backupDirectory: string;
    readonly databaseExisted: boolean;
    readonly worktreeRoot: string | undefined;
  }
>()("@satella-app/engine/DatabaseConfig") {}

export interface DatabaseLocation {
  readonly dataDirectory: string;
  readonly databasePath: string;
  readonly worktreeRoot: string | undefined;
}

const pathExists = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        const info = await stat(path);
        return info;
      } catch (cause) {
        if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
          return undefined;
        }
        throw cause;
      }
    },
    catch: (cause) =>
      new DatabaseConfigError({
        reason: "filesystem",
        path,
        cause,
        message: `Could not inspect path: ${path}`,
      }),
  });

const ensurePrivateDirectory = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(path, { mode: 0o700, recursive: true });
      await chmod(path, 0o700);
    },
    catch: (cause) =>
      new DatabaseConfigError({
        reason: "filesystem",
        path,
        cause,
        message: `Could not create directory: ${path}`,
      }),
  });

const locationFromDirectory = (
  dataDirectory: string,
  worktreeRoot: string | undefined,
): DatabaseLocation => ({
  dataDirectory,
  databasePath: join(dataDirectory, DATABASE_FILE_NAME),
  worktreeRoot,
});

const validateOverride = (
  override: string,
): Effect.Effect<DatabaseLocation, DatabaseConfigError> => {
  if (override.length === 0 || !isAbsolute(override)) {
    return Effect.fail(
      new DatabaseConfigError({
        reason: "invalid-override",
        path: override,
        cause: undefined,
        message: `${DATA_DIRECTORY_ENV} must be a non-empty absolute path`,
      }),
    );
  }

  return Effect.succeed(locationFromDirectory(resolve(override), undefined));
};

const resolveGitWorktreeRoot = Effect.tryPromise({
  try: async () => {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const worktreeRoot = stdout.trim();
    if (worktreeRoot.length === 0) {
      throw new Error("git rev-parse --show-toplevel returned an empty path");
    }
    return worktreeRoot;
  },
  catch: (cause) =>
    new DatabaseConfigError({
      reason: "worktree",
      path: process.cwd(),
      cause,
      message: `Could not resolve the Git worktree root from ${process.cwd()}. Development database tooling requires a Git checkout.`,
    }),
});

export const resolveDatabaseLocation = (
  override: string | undefined = process.env[DATA_DIRECTORY_ENV],
  canonicalOverride: string | undefined = process.env[CANONICAL_DATA_DIRECTORY_ENV],
): Effect.Effect<DatabaseLocation, DatabaseConfigError> => {
  if (process.env[DATABASE_CONTEXT_ENV] === PRODUCTION_DATABASE_CONTEXT) {
    if (canonicalOverride === undefined) {
      return Effect.fail(
        new DatabaseConfigError({
          reason: "production-not-configured",
          path: "",
          cause: undefined,
          message: "Production database ownership must be supplied by the packaged desktop.",
        }),
      );
    }
    return validateOverride(canonicalOverride);
  }

  if (override !== undefined) {
    return validateOverride(override);
  }

  if (process.env[DATABASE_CONTEXT_ENV] === DEVELOPMENT_DATABASE_CONTEXT) {
    return resolveGitWorktreeRoot.pipe(
      Effect.map((worktreeRoot) =>
        locationFromDirectory(join(worktreeRoot, WORKTREE_DATA_DIRECTORY_NAME), worktreeRoot),
      ),
    );
  }

  return Effect.fail(
    new DatabaseConfigError({
      reason: "production-not-configured",
      path: "",
      cause: undefined,
      message:
        "Production database location is not configured. Set SATELLA_DATA_DIR to an absolute directory, or start the engine through a development command.",
    }),
  );
};

const makeConfig = (override: string | undefined) =>
  Effect.gen(function* () {
    const location = yield* resolveDatabaseLocation(override, override);
    const backupDirectory = join(location.dataDirectory, "backups");

    yield* ensurePrivateDirectory(location.dataDirectory).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseConfigError({
            reason: "filesystem",
            path: location.dataDirectory,
            cause,
            message: `Could not create the Satella data directory: ${location.dataDirectory}`,
          }),
      ),
    );
    yield* ensurePrivateDirectory(backupDirectory).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseConfigError({
            reason: "filesystem",
            path: backupDirectory,
            cause,
            message: `Could not create the Satella backup directory: ${backupDirectory}`,
          }),
      ),
    );

    yield* Effect.tryPromise({
      try: () =>
        recoverInterruptedRestore({
          dataDirectory: location.dataDirectory,
          databasePath: location.databasePath,
          envelopePath: join(location.dataDirectory, ENVELOPE_FILE_NAME),
        }),
      catch: (cause) =>
        new DatabaseConfigError({
          reason: "filesystem",
          path: location.dataDirectory,
          cause,
          message: "Could not recover an interrupted Vault restore",
        }),
    });

    const databaseExisted = yield* pathExists(location.databasePath).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseConfigError({
            reason: "filesystem",
            path: location.databasePath,
            cause,
            message: `Could not inspect the Satella database path: ${location.databasePath}`,
          }),
      ),
      Effect.flatMap((info) => {
        if (info === undefined) {
          return Effect.succeed(false);
        }
        if (!info.isFile()) {
          return Effect.fail(
            new DatabaseConfigError({
              reason: "invalid-path",
              path: location.databasePath,
              cause: undefined,
              message: `The Satella database path is not a regular file: ${location.databasePath}`,
            }),
          );
        }
        return Effect.succeed(true);
      }),
    );

    return DatabaseConfig.of({
      dataDirectory: location.dataDirectory,
      databasePath: location.databasePath,
      envelopePath: join(location.dataDirectory, ENVELOPE_FILE_NAME),
      backupDirectory,
      databaseExisted,
      worktreeRoot: location.worktreeRoot,
    });
  });

export const resolveDatabaseConfig = Effect.sync(() => ({
  override: process.env[DATA_DIRECTORY_ENV],
  canonicalOverride: process.env[CANONICAL_DATA_DIRECTORY_ENV],
})).pipe(
  Effect.flatMap(({ override, canonicalOverride }) =>
    makeConfig(
      process.env[DATABASE_CONTEXT_ENV] === PRODUCTION_DATABASE_CONTEXT
        ? canonicalOverride
        : override,
    ),
  ),
);

export const DatabaseConfigLive = Layer.effect(DatabaseConfig, resolveDatabaseConfig);

export const DatabaseConfigFromDirectory = (dataDirectory: string) =>
  Layer.effect(DatabaseConfig, makeConfig(dataDirectory));

export const secureDatabaseFile = (databasePath: string) =>
  Effect.tryPromise({
    try: () => chmod(databasePath, 0o600),
    catch: (cause) =>
      new DatabaseConfigError({
        reason: "filesystem",
        path: databasePath,
        cause,
        message: `Could not apply private permissions to the Satella database: ${databasePath}`,
      }),
  });
