import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { identity } from "effect/Function";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { Reactivity } from "effect/unstable/reactivity";
import * as Client from "effect/unstable/sql/SqlClient";
import type { Connection } from "effect/unstable/sql/SqlConnection";
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError";
import * as Statement from "effect/unstable/sql/Statement";
import sqlite3 from "@journeyapps/sqlcipher";

import { DatabaseOpenError, DatabasePragmaError } from "./errors.js";
import { secureDatabaseFile, type DatabaseConfig } from "./config.js";

export interface BackupMetadata {
  readonly totalPages: number;
  readonly remainingPages: number;
}

export interface EngineSqliteClient extends Client.SqlClient {
  readonly filename: string;
  readonly backup: (destination: string) => Effect.Effect<BackupMetadata, SqlError>;
}

export class EngineSqliteClientTag extends Context.Service<
  EngineSqliteClientTag,
  EngineSqliteClient
>()("@optimus/engine/EngineSqliteClient") {}

interface SqliteConnection extends Connection {
  readonly backup: (destination: string) => Effect.Effect<BackupMetadata, SqlError>;
}

type SqlcipherDatabase = InstanceType<typeof sqlite3.Database> & {
  backup: (
    filename: string,
    callback?: (error: Error | null) => void,
  ) => {
    step: (pages: number, callback: (error: Error | null) => void) => void;
    finish: (callback: (error: Error | null) => void) => void;
    pageCount: number;
    remaining: number;
  };
};

const runAll = (
  db: SqlcipherDatabase,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<ReadonlyArray<Record<string, unknown>>> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve((rows ?? []) as ReadonlyArray<Record<string, unknown>>);
    });
  });

const runExec = (db: SqlcipherDatabase, sql: string): Promise<void> =>
  new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const runRaw = (
  db: SqlcipherDatabase,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<{ changes: number; lastInsertRowid: number }> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastInsertRowid: this.lastID });
    });
  });

const openDatabase = (filename: string): Promise<SqlcipherDatabase> =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, (error) => {
      if (error) reject(error);
      else resolve(db as SqlcipherDatabase);
    });
  });

const closeDatabase = (db: SqlcipherDatabase): Promise<void> =>
  new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const pragmaValue = async (db: SqlcipherDatabase, pragma: string, key = pragma) => {
  const rows = await runAll(db, `PRAGMA ${pragma}`, []);
  const row = rows[0];
  if (row === undefined) return undefined;
  if (key in row) return row[key];
  const values = Object.values(row);
  return values[0];
};

const classify = (cause: unknown, message: string, operation: string) =>
  new SqlError({ reason: classifySqliteError(cause, { message, operation }) });

const rawKeyPragma = (dek: Uint8Array) => `PRAGMA key = "x'${Buffer.from(dek).toString("hex")}'"`;

const configureEncryptedConnection = async (db: SqlcipherDatabase, dek: Uint8Array) => {
  db.configure("busyTimeout", 5_000);
  await runExec(db, rawKeyPragma(dek));
  const cipherVersion = await pragmaValue(db, "cipher_version");
  if (typeof cipherVersion !== "string" || cipherVersion.length === 0) {
    throw new DatabasePragmaError({
      pragma: "cipher_version",
      expected: "a SQLCipher version string",
      actual: cipherVersion,
      cause: undefined,
      message: "SQLCipher is not active on the Vault database connection",
    });
  }
  await runExec(db, "PRAGMA cipher_compatibility = 4");
  await runExec(db, "PRAGMA temp_store = MEMORY");
  const tempStore = await pragmaValue(db, "temp_store");
  if (tempStore !== 2) {
    throw new DatabasePragmaError({
      pragma: "temp_store",
      expected: "2 (MEMORY)",
      actual: tempStore,
      cause: undefined,
      message: "SQLite temporary storage was not confined to memory",
    });
  }
  await runExec(db, "PRAGMA foreign_keys = ON");
  await runExec(db, "PRAGMA synchronous = FULL");
  await runExec(db, "PRAGMA journal_mode = WAL");
  const foreignKeys = await pragmaValue(db, "foreign_keys");
  if (foreignKeys !== 1) {
    throw new DatabasePragmaError({
      pragma: "foreign_keys",
      expected: "1",
      actual: foreignKeys,
      cause: undefined,
      message: `SQLite foreign-key enforcement was not enabled (received ${String(foreignKeys)})`,
    });
  }
  await runAll(db, "SELECT count(*) AS n FROM sqlite_master", []);
};

export const makeEncryptedSqliteClient = (options: {
  readonly filename: string;
  readonly dek: Uint8Array;
}): Effect.Effect<
  EngineSqliteClient,
  DatabaseOpenError | DatabasePragmaError,
  Scope.Scope | Reactivity.Reactivity
> =>
  Effect.gen(function* () {
    const compiler = Statement.makeCompilerSqlite();
    const makeConnection = Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const db = yield* Effect.tryPromise({
        try: async () => {
          const opened = await openDatabase(options.filename);
          try {
            await configureEncryptedConnection(opened, options.dek);
            return opened;
          } catch (cause) {
            await closeDatabase(opened).catch(() => undefined);
            throw cause;
          }
        },
        catch: (cause) =>
          cause instanceof DatabasePragmaError
            ? cause
            : new DatabaseOpenError({
                path: options.filename,
                cause,
                message: `Could not open the encrypted Vault database: ${options.filename}`,
              }),
      });
      yield* Scope.addFinalizer(
        scope,
        Effect.promise(() => closeDatabase(db).catch(() => undefined)),
      );

      const prepareCache = yield* Cache.make({
        capacity: 200,
        timeToLive: Duration.minutes(10),
        lookup: (sql: string) => Effect.succeed(sql),
      });

      const run = (sql: string, params: ReadonlyArray<unknown>, raw = false) =>
        Effect.tryPromise({
          try: async () => {
            if (raw) {
              return [await runRaw(db, sql, params)] as unknown as ReadonlyArray<any>;
            }
            return await runAll(db, sql, params);
          },
          catch: (cause) => classify(cause, "Failed to execute statement", "execute"),
        });

      const execute = (sql: string, params: ReadonlyArray<unknown>, raw = false) =>
        Cache.get(prepareCache, sql).pipe(Effect.flatMap(() => run(sql, params, raw)));

      return identity<SqliteConnection>({
        execute(sql, params, transformRows) {
          return transformRows
            ? Effect.map(execute(sql, params), transformRows)
            : execute(sql, params);
        },
        executeRaw(sql, params) {
          return execute(sql, params, true);
        },
        executeValues(sql, params) {
          return Effect.map(execute(sql, params), (rows) =>
            rows.map((row) => Object.values(row as Record<string, unknown>)),
          );
        },
        executeValuesUnprepared(sql, params) {
          return Effect.map(execute(sql, params), (rows) =>
            rows.map((row) => Object.values(row as Record<string, unknown>)),
          );
        },
        executeUnprepared(sql, params, transformRows) {
          const effect = execute(sql, params ?? [], false);
          return transformRows ? Effect.map(effect, transformRows) : effect;
        },
        executeStream() {
          return Stream.die("executeStream not implemented");
        },
        backup(destination) {
          const escaped = destination.replaceAll("'", "''");
          return Effect.tryPromise({
            try: async () => {
              await runExec(db, `VACUUM INTO '${escaped}'`);
              return { totalPages: 0, remainingPages: 0 };
            },
            catch: (cause) => classify(cause, "Failed to backup database", "backup"),
          });
        },
      });
    });

    const semaphore = yield* Semaphore.make(1);
    const connection = yield* makeConnection;
    const acquirer = semaphore.withPermits(1)(Effect.succeed(connection));
    const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
      const fiber = Fiber.getCurrent()!;
      const scope = Context.getUnsafe(fiber.context, Scope.Scope);
      return Effect.as(
        Effect.tap(restore(semaphore.take(1)), () =>
          Scope.addFinalizer(scope, semaphore.release(1)),
        ),
        connection,
      );
    });

    const client = (yield* Client.make({
      acquirer,
      compiler,
      transactionAcquirer,
      beginTransaction: "BEGIN IMMEDIATE",
      spanAttributes: [["db.system.name", "sqlite"]],
    })) as EngineSqliteClient;

    return Object.assign(client, {
      filename: options.filename,
      backup: (destination: string) => Effect.flatMap(acquirer, (item) => item.backup(destination)),
    });
  });

export const makeSqliteClient = (config: typeof DatabaseConfig.Service, dek: Uint8Array) =>
  Effect.gen(function* () {
    const client = yield* makeEncryptedSqliteClient({ filename: config.databasePath, dek });
    yield* secureDatabaseFile(config.databasePath);
    return client;
  }).pipe(Effect.provide(Reactivity.layer));
