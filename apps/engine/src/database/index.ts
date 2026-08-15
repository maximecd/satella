import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SqlClient } from "effect/unstable/sql";
import * as Sqlite from "@effect/sql-sqlite-node/SqliteClient";

import { DatabaseConfig, DatabaseConfigFromDirectory, DatabaseConfigLive } from "./config.js";
import { makeSqliteClient } from "./client.js";
import {
  DatabaseBackupError,
  DatabaseConfigError,
  DatabaseHistoryError,
  DatabaseMigrationError,
  DatabaseOpenError,
  DatabaseOwnedError,
  DatabasePragmaError,
  DatabaseValidationError,
} from "./errors.js";
import {
  MigrationRegistry,
  MigrationRunOptions,
  ProductionMigrations,
  runMigrations,
} from "./migrations.js";
import { claimDatabaseOwnership, releaseDatabaseOwnership } from "./ownership.js";

export {
  DatabaseConfig,
  DatabaseConfigFromDirectory,
  DatabaseConfigLive,
  DatabaseBackupError,
  DatabaseConfigError,
  DatabaseHistoryError,
  DatabaseMigrationError,
  DatabaseOpenError,
  DatabaseOwnedError,
  DatabasePragmaError,
  ProductionMigrations,
  runMigrations,
  DatabaseValidationError,
};
export type { DatabaseError } from "./errors.js";
export type { MigrationRegistry, MigrationRunOptions } from "./migrations.js";

export class DatabaseReady extends Context.Service<DatabaseReady, { readonly ready: true }>()(
  "@optimus/engine/DatabaseReady",
) {}

export interface DatabaseLiveOptions extends Omit<MigrationRunOptions, "registry"> {
  readonly migrations?: MigrationRegistry;
  readonly claimOwnership?: boolean;
}

export const makeDatabaseLive = (options: DatabaseLiveOptions = {}) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const config = yield* DatabaseConfig;
      if (options.claimOwnership === true) {
        yield* claimDatabaseOwnership(config.dataDirectory);
        yield* Effect.addFinalizer(() => releaseDatabaseOwnership(config.dataDirectory));
      }
      const client = yield* makeSqliteClient(config);
      const summary = yield* runMigrations({
        registry: options.migrations ?? ProductionMigrations,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.backupRetention === undefined
          ? {}
          : { backupRetention: options.backupRetention }),
      }).pipe(
        Effect.provideService(DatabaseConfig, config),
        Effect.provideService(SqlClient.SqlClient, client),
        Effect.provideService(Sqlite.SqliteClient, client),
      );
      const initialized = Effect.logInfo("SQLite database initialized")
        .pipe(Effect.annotateLogs("database_path", config.databasePath))
        .pipe(Effect.annotateLogs("migration_count", String(summary.applied.length)));
      yield* config.worktreeRoot === undefined
        ? initialized
        : initialized.pipe(Effect.annotateLogs("worktree_root", config.worktreeRoot));
      yield* Effect.addFinalizer(() =>
        Effect.logDebug("SQLite database closed").pipe(
          Effect.annotateLogs("database_path", config.databasePath),
        ),
      );
      return Context.make(DatabaseConfig, config)
        .pipe(Context.add(DatabaseReady, DatabaseReady.of({ ready: true })))
        .pipe(Context.add(Sqlite.SqliteClient, client))
        .pipe(Context.add(SqlClient.SqlClient, client));
    }),
  );

export const DatabaseLive = makeDatabaseLive({ claimOwnership: true }).pipe(
  Layer.provide(DatabaseConfigLive),
);
