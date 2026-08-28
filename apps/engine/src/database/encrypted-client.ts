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
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";

import { decryptSqliteBytes, encryptSqliteBytes } from "./database-cipher.js";
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
>()("@satella-app/engine/EngineSqliteClient") {}

interface SqliteConnection extends Connection {
  readonly backup: (destination: string) => Effect.Effect<BackupMetadata, SqlError>;
}

const classify = (cause: unknown, message: string, operation: string) =>
  new SqlError({ reason: classifySqliteError(cause, { message, operation }) });

const fileSize = (path: string) => {
  try {
    const info = statSync(path);
    return info.isFile() ? info.size : 0;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return 0;
    throw cause;
  }
};

const persistCiphertext = (db: DatabaseSync, dek: Uint8Array, destination: string) => {
  const packed = encryptSqliteBytes(dek, db.serialize());
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp`;
  writeFileSync(temporary, packed, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
};

type SqliteBindValue = string | number | bigint | Uint8Array | null;
type SqliteRow = { readonly [column: string]: SqliteBindValue };

const sqliteBindParams = (params: ReadonlyArray<unknown>): Array<SqliteBindValue> => {
  // SAFETY: Effect SqlClient bind parameters are SQLite values; node:sqlite accepts them as a rest array.
  return params as Array<SqliteBindValue>;
};

const sqliteResultRows = (rows: ReadonlyArray<SqliteRow>): ReadonlyArray<object> => rows;

const sqliteRowValues = (row: SqliteRow): ReadonlyArray<unknown> => Object.values(row);

const sqliteMutationResult = (result: {
  readonly changes: number | bigint;
  readonly lastInsertRowid: number | bigint;
}): ReadonlyArray<object> => {
  // SAFETY: Effect's raw execute path expects the mutation metadata as a one-row array.
  return [{ changes: result.changes, lastInsertRowid: result.lastInsertRowid }];
};

const configureMemoryDatabase = (db: DatabaseSync) => {
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = FULL");
  // SAFETY: PRAGMA temp_store returns one row whose temp_store column is 2 when MEMORY is in effect.
  const tempStore = db.prepare("PRAGMA temp_store").get() as { temp_store?: number } | undefined;
  // SAFETY: PRAGMA foreign_keys returns one row whose foreign_keys column is 1 when enforcement is on.
  const foreignKeys = db.prepare("PRAGMA foreign_keys").get() as
    | { foreign_keys?: number }
    | undefined;
  const tempValue =
    tempStore === undefined ? undefined : (tempStore.temp_store ?? Object.values(tempStore)[0]);
  const foreignValue =
    foreignKeys === undefined
      ? undefined
      : (foreignKeys.foreign_keys ?? Object.values(foreignKeys)[0]);
  if (tempValue !== 2) {
    throw new DatabasePragmaError({
      pragma: "temp_store",
      expected: "2 (MEMORY)",
      actual: tempValue,
      cause: undefined,
      message: "SQLite temporary storage was not confined to memory",
    });
  }
  if (foreignValue !== 1) {
    throw new DatabasePragmaError({
      pragma: "foreign_keys",
      expected: "1",
      actual: foreignValue,
      cause: undefined,
      message: `SQLite foreign-key enforcement was not enabled (received ${String(foreignValue)})`,
    });
  }
};

const openMemoryDatabase = (filename: string, dek: Uint8Array) => {
  const db = new DatabaseSync(":memory:");
  try {
    const size = fileSize(filename);
    if (size > 0) {
      db.deserialize(decryptSqliteBytes(dek, readFileSync(filename)));
    }
    configureMemoryDatabase(db);
    persistCiphertext(db, dek, filename);
    return db;
  } catch (cause) {
    db.close();
    if (cause instanceof DatabasePragmaError) throw cause;
    throw new DatabaseOpenError({
      path: filename,
      cause,
      message: `Could not open the encrypted Vault database: ${filename}`,
    });
  }
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
    const dek = new Uint8Array(options.dek);
    const compiler = Statement.makeCompilerSqlite();
    const makeConnection = Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const db = yield* Effect.try({
        try: () => openMemoryDatabase(options.filename, dek),
        catch: (cause) =>
          cause instanceof DatabasePragmaError || cause instanceof DatabaseOpenError
            ? cause
            : new DatabaseOpenError({
                path: options.filename,
                cause,
                message: `Could not open the encrypted Vault database: ${options.filename}`,
              }),
      });
      const persist = () => {
        if (!db.isOpen) return;
        persistCiphertext(db, dek, options.filename);
      };
      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          try {
            persist();
          } finally {
            dek.fill(0);
            if (db.isOpen) db.close();
          }
        }),
      );

      const prepareCache = yield* Cache.make({
        capacity: 200,
        timeToLive: Duration.minutes(10),
        lookup: (sql: string) =>
          Effect.try({
            try: () => db.prepare(sql),
            catch: (cause) => classify(cause, "Failed to prepare statement", "prepare"),
          }),
      });

      const runStatement = (
        statement: StatementSync,
        params: ReadonlyArray<unknown>,
        raw: boolean,
      ) =>
        Effect.withFiber<ReadonlyArray<object>, SqlError>((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers);
          return Effect.try({
            try: () => {
              statement.setReadBigInts(useSafeIntegers);
              if (statement.columns().length > 0) {
                // SAFETY: node:sqlite statement.all returns column-name objects for SELECT statements.
                return sqliteResultRows(
                  statement.all(...sqliteBindParams(params)) as ReadonlyArray<SqliteRow>,
                );
              }
              const result = statement.run(...sqliteBindParams(params));
              persist();
              return raw ? sqliteMutationResult(result) : [];
            },
            catch: (cause) => classify(cause, "Failed to execute statement", "execute"),
          });
        });

      const run = (sql: string, params: ReadonlyArray<unknown>, raw = false) =>
        Effect.flatMap(Cache.get(prepareCache, sql), (statement) =>
          runStatement(statement, params, raw),
        );

      return identity<SqliteConnection>({
        execute(sql, params, transformRows) {
          return transformRows ? Effect.map(run(sql, params), transformRows) : run(sql, params);
        },
        executeRaw(sql, params) {
          return run(sql, params, true);
        },
        executeValues(sql, params) {
          return Effect.map(run(sql, params), (rows) =>
            rows.map((row) => {
              // SAFETY: SELECT rows from node:sqlite are column-name objects.
              return sqliteRowValues(row as SqliteRow);
            }),
          );
        },
        executeValuesUnprepared(sql, params) {
          return Effect.map(run(sql, params), (rows) =>
            rows.map((row) => {
              // SAFETY: SELECT rows from node:sqlite are column-name objects.
              return sqliteRowValues(row as SqliteRow);
            }),
          );
        },
        executeUnprepared(sql, params, transformRows) {
          const effect = runStatement(db.prepare(sql), params ?? [], false);
          return transformRows ? Effect.map(effect, transformRows) : effect;
        },
        executeStream() {
          return Stream.die("executeStream not implemented");
        },
        backup(destination) {
          return Effect.try({
            try: () => {
              persistCiphertext(db, dek, destination);
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

    // SAFETY: The connection and compiler above are the complete dependencies required by the EngineSqliteClient adapter.
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
