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
  DatabasePragmaError,
  DatabaseValidationError,
} from "./errors.js";
import {
  MigrationRegistry,
  MigrationRunOptions,
  ProductionMigrations,
  runMigrations,
} from "./migrations.js";

export {
  DatabaseConfig,
  DatabaseConfigFromDirectory,
  DatabaseConfigLive,
  DatabaseBackupError,
  DatabaseConfigError,
  DatabaseHistoryError,
  DatabaseMigrationError,
  DatabaseOpenError,
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
}

export const makeDatabaseLive = (options: DatabaseLiveOptions = {}) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const config = yield* DatabaseConfig;
      const client = yield* makeSqliteClient(config);
      const summary = yield* runMigrations({
        ...options,
        registry: options.migrations ?? ProductionMigrations,
      }).pipe(
        Effect.provideService(DatabaseConfig, config),
        Effect.provideService(SqlClient.SqlClient, client),
        Effect.provideService(Sqlite.SqliteClient, client),
      );
      yield* Effect.logInfo("SQLite database initialized")
        .pipe(Effect.annotateLogs("database_path", config.databasePath))
        .pipe(Effect.annotateLogs("migration_count", String(summary.applied.length)));
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

export const DatabaseLive = makeDatabaseLive().pipe(Layer.provide(DatabaseConfigLive));
