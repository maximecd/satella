import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { chmod, mkdir, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { DatabaseConfigError } from "./errors.js";

const DATA_DIRECTORY_ENV = "OPTIMUS_DATA_DIR";

export interface DatabaseConfig {
  readonly dataDirectory: string;
  readonly databasePath: string;
  readonly backupDirectory: string;
  readonly databaseExisted: boolean;
}

export const DatabaseConfig = Context.GenericTag<DatabaseConfig>("@optimus/engine/DatabaseConfig");

const defaultDataDirectory = (): string => {
  const home = homedir();

  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Optimus");
    case "win32":
      return join(process.env["LOCALAPPDATA"] ?? join(home, "AppData", "Local"), "Optimus");
    default: {
      const xdgDataHome = process.env["XDG_DATA_HOME"];
      return join(
        xdgDataHome !== undefined && isAbsolute(xdgDataHome)
          ? xdgDataHome
          : join(home, ".local", "share"),
        "Optimus",
      );
    }
  }
};

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
    catch: (cause) => cause,
  });

const ensurePrivateDirectory = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(path, { mode: 0o700, recursive: true });
      await chmod(path, 0o700);
    },
    catch: (cause) => cause,
  });

const resolveDataDirectory = (
  override: string | undefined,
): Effect.Effect<string, DatabaseConfigError> => {
  if (override !== undefined) {
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

    return Effect.succeed(resolve(override));
  }

  return Effect.succeed(resolve(defaultDataDirectory()));
};

const makeConfig = (override: string | undefined) =>
  Effect.gen(function* () {
    const dataDirectory = yield* resolveDataDirectory(override);
    const backupDirectory = join(dataDirectory, "backups");
    const databasePath = join(dataDirectory, "optimus.sqlite");

    yield* ensurePrivateDirectory(dataDirectory).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseConfigError({
            reason: "filesystem",
            path: dataDirectory,
            cause,
            message: `Could not create the Optimus data directory: ${dataDirectory}`,
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
            message: `Could not create the Optimus backup directory: ${backupDirectory}`,
          }),
      ),
    );

    const databaseExisted = yield* pathExists(databasePath).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseConfigError({
            reason: "filesystem",
            path: databasePath,
            cause,
            message: `Could not inspect the Optimus database path: ${databasePath}`,
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
              path: databasePath,
              cause: undefined,
              message: `The Optimus database path is not a regular file: ${databasePath}`,
            }),
          );
        }
        return Effect.succeed(true);
      }),
    );

    return {
      dataDirectory,
      databasePath,
      backupDirectory,
      databaseExisted,
    } satisfies DatabaseConfig;
  });

export const resolveDatabaseConfig = Effect.sync(() => process.env[DATA_DIRECTORY_ENV]).pipe(
  Effect.flatMap(makeConfig),
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
        message: `Could not apply private permissions to the Optimus database: ${databasePath}`,
      }),
  });
