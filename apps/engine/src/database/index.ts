import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SqlClient } from "effect/unstable/sql";

import { DatabaseConfig, DatabaseConfigFromDirectory, DatabaseConfigLive } from "./config.js";
import { EngineSqliteClientTag, makeSqliteClient } from "./encrypted-client.js";
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
export { EngineSqliteClientTag, makeSqliteClient } from "./encrypted-client.js";
export type { DatabaseError } from "./errors.js";
export type { MigrationRegistry, MigrationRunOptions } from "./migrations.js";

export class DatabaseKey extends Context.Service<DatabaseKey, { readonly dek: Uint8Array }>()(
  "@satella-app/engine/DatabaseKey",
) {}

export class DatabaseReady extends Context.Service<DatabaseReady, { readonly ready: true }>()(
  "@satella-app/engine/DatabaseReady",
) {}

export interface DatabaseLiveOptions extends Omit<MigrationRunOptions, "registry"> {
  readonly migrations?: MigrationRegistry;
  readonly claimOwnership?: boolean;
}

export const makeDatabaseLive = (options: DatabaseLiveOptions = {}) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const config = yield* DatabaseConfig;
      const key = yield* DatabaseKey;
      if (options.claimOwnership === true) {
        yield* claimDatabaseOwnership(config.dataDirectory);
        yield* Effect.addFinalizer(() => releaseDatabaseOwnership(config.dataDirectory));
      }
      const client = yield* makeSqliteClient(config, key.dek);
      const migrationOptions = {
        registry: options.migrations ?? ProductionMigrations,
      };
      if (options.now !== undefined) Object.assign(migrationOptions, { now: options.now });
      if (options.backupRetention !== undefined) {
        Object.assign(migrationOptions, { backupRetention: options.backupRetention });
      }
      const summary = yield* runMigrations(migrationOptions).pipe(
        Effect.provideService(DatabaseConfig, config),
        Effect.provideService(SqlClient.SqlClient, client),
        Effect.provideService(EngineSqliteClientTag, client),
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
        .pipe(Context.add(DatabaseKey, key))
        .pipe(Context.add(EngineSqliteClientTag, client))
        .pipe(Context.add(SqlClient.SqlClient, client));
    }),
  );

export const DatabaseLive = makeDatabaseLive({ claimOwnership: true }).pipe(
  Layer.provide(DatabaseConfigLive),
);
