import { Migrator } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import { SqlSchema } from "effect/unstable/sql";
import * as Sqlite from "@effect/sql-sqlite-node/SqliteClient";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { chmod, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { DatabaseConfig } from "./config.js";
import {
  DatabaseBackupError,
  DatabaseHistoryError,
  DatabaseMigrationError,
  DatabaseValidationError,
} from "./errors.js";
import { initialFinanceModel } from "./migrations/0001_initial_finance_model.js";
import { seedDefaultFiatCurrencies } from "./migrations/0002_seed_default_fiat_currencies.js";
import { addAccountSourceDate } from "./migrations/0003_account_source_date.js";
import { addAccountKindAndSystemRoles } from "./migrations/0004_account_kind_and_system_roles.js";
import { unifyPortfolioDomainModel } from "./migrations/0005_unify_portfolio_domain_model.js";
import { addSettingsAndDailySnapshots } from "./migrations/0006_settings_and_daily_snapshots.js";

export const MIGRATIONS_TABLE = "effect_sql_migrations";
export const PRE_MIGRATION_BACKUP_RETENTION = 5;

export type MigrationRegistry = Readonly<
  Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>
>;

export const ProductionMigrations: MigrationRegistry = {
  "0001_initial_finance_model": initialFinanceModel,
  "0002_seed_default_fiat_currencies": seedDefaultFiatCurrencies,
  "0003_account_source_date": addAccountSourceDate,
  "0004_account_kind_and_system_roles": addAccountKindAndSystemRoles,
  "0005_unify_portfolio_domain_model": unifyPortfolioDomainModel,
  "0006_settings_and_daily_snapshots": addSettingsAndDailySnapshots,
};

export interface MigrationRunOptions {
  readonly registry: MigrationRegistry;
  readonly now?: () => Date;
  readonly backupRetention?: number;
}

export interface MigrationRunSummary {
  readonly applied: ReadonlyArray<readonly [number, string]>;
  readonly pendingBeforeRun: ReadonlyArray<readonly [number, string]>;
  readonly backupPath?: string;
}

const MigrationRow = Schema.Struct({
  migration_id: Schema.Number,
  name: Schema.String,
});

const MigrationTableRow = Schema.Struct({
  name: Schema.String,
});

const QuickCheckRow = Schema.Struct({
  quick_check: Schema.String,
});

const ForeignKeyCheckRow = Schema.Struct({
  table: Schema.Unknown,
  rowid: Schema.Unknown,
  parent: Schema.Unknown,
  fkid: Schema.Unknown,
});

const parseRegistry = (
  registry: MigrationRegistry,
): Effect.Effect<ReadonlyArray<readonly [number, string]>, DatabaseHistoryError> => {
  const entries: Array<{ id: number; name: string }> = [];
  const ids = new Set<number>();

  for (const key of Object.keys(registry)) {
    const match = /^(\d+)_([^\s]+)$/.exec(key);
    if (match === null) {
      return Effect.fail(
        new DatabaseHistoryError({
          reason: "invalid-registry",
          applied: [],
          expected: [],
          cause: undefined,
          message: `Migration key must have the form <number>_<name>: ${key}`,
        }),
      );
    }

    const id = Number(match[1]);
    const name = match[2];
    if (!Number.isSafeInteger(id) || id <= 0 || name === undefined || ids.has(id)) {
      return Effect.fail(
        new DatabaseHistoryError({
          reason: "invalid-registry",
          applied: [],
          expected: [],
          cause: undefined,
          message: `Migration registry contains an invalid or duplicate id: ${key}`,
        }),
      );
    }

    ids.add(id);
    entries.push({ id, name });
  }

  entries.sort((left, right) => left.id - right.id);
  return Effect.succeed(entries.map(({ id, name }) => [id, name] as const));
};

const tableExists = (sql: SqlClient.SqlClient) =>
  SqlSchema.findOneOption({
    Request: Schema.Struct({ table: Schema.String }),
    Result: MigrationTableRow,
    execute: ({ table }) =>
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table} LIMIT 1`
        .withoutTransform,
  })({ table: MIGRATIONS_TABLE }).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseHistoryError({
          reason: "mismatch",
          applied: [],
          expected: [],
          cause,
          message: "Could not inspect the SQLite migration ledger",
        }),
    ),
  );

const readAppliedMigrations = (sql: SqlClient.SqlClient) =>
  SqlSchema.findAll({
    Request: Schema.Void,
    Result: MigrationRow,
    execute: () =>
      sql`SELECT migration_id, name FROM ${sql.literal(MIGRATIONS_TABLE)} ORDER BY migration_id ASC`
        .withoutTransform,
  })(undefined).pipe(
    Effect.map((rows) => rows.map(({ migration_id, name }) => [migration_id, name] as const)),
    Effect.mapError(
      (cause) =>
        new DatabaseHistoryError({
          reason: "mismatch",
          applied: [],
          expected: [],
          cause,
          message: "Could not read the SQLite migration ledger",
        }),
    ),
  );

const historyMismatch = (
  applied: ReadonlyArray<readonly [number, string]>,
  expected: ReadonlyArray<readonly [number, string]>,
): DatabaseHistoryError =>
  new DatabaseHistoryError({
    reason: applied.length > expected.length ? "newer-than-binary" : "mismatch",
    applied,
    expected,
    cause: undefined,
    message:
      applied.length > expected.length
        ? "The SQLite database was created by a newer Optimus schema"
        : "The SQLite migration history is not an exact prefix of the running binary",
  });

const validateHistory = (
  applied: ReadonlyArray<readonly [number, string]>,
  expected: ReadonlyArray<readonly [number, string]>,
) => {
  const appliedIds = new Set<number>();
  for (const [index, [id, name]] of applied.entries()) {
    if (
      appliedIds.has(id) ||
      index >= expected.length ||
      expected[index]?.[0] !== id ||
      expected[index]?.[1] !== name
    ) {
      return Effect.fail(historyMismatch(applied, expected));
    }
    appliedIds.add(id);
  }
  return Effect.succeed(undefined);
};

const quickCheck = (sql: SqlClient.SqlClient) =>
  SqlSchema.findAll({
    Request: Schema.Void,
    Result: QuickCheckRow,
    execute: () => sql`PRAGMA quick_check`.withoutTransform,
  })(undefined).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseValidationError({
          check: "quick_check",
          cause,
          message: "SQLite quick_check could not be completed",
        }),
    ),
    Effect.flatMap((rows) => {
      if (rows.length === 0 || rows.some(({ quick_check }) => quick_check !== "ok")) {
        return Effect.fail(
          new DatabaseValidationError({
            check: "quick_check",
            cause: rows,
            message: `SQLite quick_check reported an unhealthy database: ${rows.map(({ quick_check }) => quick_check).join(", ")}`,
          }),
        );
      }
      return Effect.succeed(undefined);
    }),
  );

const foreignKeyCheck = (sql: SqlClient.SqlClient) =>
  SqlSchema.findAll({
    Request: Schema.Void,
    Result: ForeignKeyCheckRow,
    execute: () => sql`PRAGMA foreign_key_check`.withoutTransform,
  })(undefined).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseValidationError({
          check: "foreign_key_check",
          cause,
          message: "SQLite foreign_key_check could not be completed",
        }),
    ),
    Effect.flatMap((rows) =>
      rows.length === 0
        ? Effect.succeed(undefined)
        : Effect.fail(
            new DatabaseValidationError({
              check: "foreign_key_check",
              cause: rows,
              message: `SQLite foreign_key_check reported ${rows.length} violation(s)`,
            }),
          ),
    ),
  );

const validateDatabase = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    yield* quickCheck(sql);
    yield* foreignKeyCheck(sql);
  });

const backupTimestamp = (date: Date) =>
  date.toISOString().replaceAll(":", "-").replaceAll(".", "-");

const createBackup = (
  config: typeof DatabaseConfig.Service,
  sqlite: Sqlite.SqliteClient,
  sql: SqlClient.SqlClient,
  from: number,
  to: number,
  now: () => Date,
) => {
  const path = join(
    config.backupDirectory,
    `pre-migration-${from}-to-${to}-${backupTimestamp(now())}.sqlite`,
  );

  return Effect.gen(function* () {
    yield* quickCheck(sql);
    yield* sqlite.backup(path);
    const info = yield* Effect.tryPromise({
      try: () => stat(path),
      catch: (cause) =>
        new DatabaseBackupError({
          path,
          cause,
          message: `Could not create a consistent pre-migration backup: ${path}`,
        }),
    });
    if (!info.isFile() || info.size === 0) {
      return yield* new DatabaseBackupError({
        path,
        cause: undefined,
        message: `Could not create a consistent pre-migration backup: ${path}`,
      });
    }
    yield* Effect.tryPromise({
      try: () => chmod(path, 0o600),
      catch: (cause) =>
        new DatabaseBackupError({
          path,
          cause,
          message: `Could not create a consistent pre-migration backup: ${path}`,
        }),
    });
    return path;
  }).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseBackupError({
          path,
          cause,
          message: `Could not create a consistent pre-migration backup: ${path}`,
        }),
    ),
  );
};

class BackupPruneError extends Data.TaggedError("BackupPruneError")<{
  readonly cause: unknown;
}> {}

const pruneBackups = (directory: string, retention: number) =>
  Effect.tryPromise({
    try: async () => {
      const names = (await readdir(directory)).filter(
        (name) => name.startsWith("pre-migration-") && name.endsWith(".sqlite"),
      );
      names.sort((left, right) => right.localeCompare(left));
      for (const name of names.slice(Math.max(0, retention))) {
        await unlink(join(directory, name));
      }
    },
    catch: (cause) => new BackupPruneError({ cause }),
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Could not prune old SQLite migration backups", cause),
    ),
  );

const pendingMigrations = (
  applied: ReadonlyArray<readonly [number, string]>,
  expected: ReadonlyArray<readonly [number, string]>,
) => expected.slice(applied.length);

export const runMigrations = (options: MigrationRunOptions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const sqlite = yield* Sqlite.SqliteClient;
    const config = yield* DatabaseConfig;
    const expected = yield* parseRegistry(options.registry);
    const hasLedger = yield* tableExists(sql);
    const applied = Option.match(hasLedger, {
      onNone: () => Effect.succeed<ReadonlyArray<readonly [number, string]>>([]),
      onSome: () => readAppliedMigrations(sql),
    });
    const appliedMigrations = yield* applied;
    yield* validateHistory(appliedMigrations, expected);

    const pendingBeforeRun = pendingMigrations(appliedMigrations, expected);
    const backupPath =
      config.databaseExisted && pendingBeforeRun.length > 0
        ? yield* createBackup(
            config,
            sqlite,
            sql,
            appliedMigrations.at(-1)?.[0] ?? 0,
            pendingBeforeRun.at(-1)?.[0] ?? 0,
            options.now ?? (() => new Date()),
          )
        : undefined;

    const completed = yield* Migrator.make({})({
      loader: Migrator.fromRecord(options.registry),
      table: MIGRATIONS_TABLE,
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.fail(
          new DatabaseMigrationError({
            cause,
            message: "SQLite migrations failed; the migration transaction was rolled back",
          }),
        ),
      ),
    );

    const finalApplied = yield* readAppliedMigrations(sql);
    yield* validateHistory(finalApplied, expected);
    yield* validateDatabase(sql);

    if (completed.length > 0) {
      yield* pruneBackups(
        config.backupDirectory,
        Math.max(1, options.backupRetention ?? PRE_MIGRATION_BACKUP_RETENTION),
      );
    }

    return {
      applied: finalApplied,
      pendingBeforeRun,
      ...(backupPath === undefined ? {} : { backupPath }),
    } satisfies MigrationRunSummary;
  });
