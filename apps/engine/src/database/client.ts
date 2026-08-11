import * as Reactivity from "@effect/experimental/Reactivity";
import * as SqlClient from "@effect/sql/SqlClient";
import * as Sqlite from "@effect/sql-sqlite-node/SqliteClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { DatabaseConfig, secureDatabaseFile } from "./config.js";
import { DatabaseOpenError, DatabasePragmaError } from "./errors.js";

const NumericPragmaRow = Schema.Struct({
  foreign_keys: Schema.optional(Schema.Number),
  timeout: Schema.optional(Schema.Number),
  synchronous: Schema.optional(Schema.Number),
});

type NumericPragmaRow = Schema.Schema.Type<typeof NumericPragmaRow>;

const openClient = (config: DatabaseConfig) =>
  Sqlite.make({
    filename: config.databasePath,
    disableWAL: false,
  }).pipe(
    Effect.provide(Reactivity.layer),
    Effect.catchAllCause((cause) =>
      Effect.fail(
        new DatabaseOpenError({
          path: config.databasePath,
          cause,
          message: `Could not open the Optimus SQLite database: ${config.databasePath}`,
        }),
      ),
    ),
  );

const readNumericPragma = (client: Sqlite.SqliteClient, pragma: string, resultKey = pragma) =>
  client<NumericPragmaRow>`PRAGMA ${client.literal(pragma)}`.pipe(
    Effect.flatMap(Schema.decodeUnknown(Schema.Array(NumericPragmaRow))),
    Effect.map((rows) => rows[0]?.[resultKey as keyof NumericPragmaRow]),
    Effect.flatMap((value) =>
      value === undefined
        ? Effect.fail(
            new DatabasePragmaError({
              pragma,
              expected: "a numeric value",
              actual: value,
              cause: undefined,
              message: `SQLite did not return a value for PRAGMA ${pragma}`,
            }),
          )
        : Effect.succeed(value),
    ),
  );

const configurePragmas = (client: Sqlite.SqliteClient) =>
  Effect.gen(function* () {
    yield* client`PRAGMA foreign_keys = ON`;
    yield* client`PRAGMA busy_timeout = 5000`;
    yield* client`PRAGMA synchronous = FULL`;

    const foreignKeys = yield* readNumericPragma(client, "foreign_keys");
    if (foreignKeys !== 1) {
      return yield* Effect.fail(
        new DatabasePragmaError({
          pragma: "foreign_keys",
          expected: "1",
          actual: foreignKeys,
          cause: undefined,
          message: `SQLite foreign-key enforcement was not enabled (received ${String(foreignKeys)})`,
        }),
      );
    }

    const busyTimeout = yield* readNumericPragma(client, "busy_timeout", "timeout");
    if (busyTimeout !== 5000) {
      return yield* Effect.fail(
        new DatabasePragmaError({
          pragma: "busy_timeout",
          expected: "5000",
          actual: busyTimeout,
          cause: undefined,
          message: `SQLite busy_timeout was not set to 5000ms (received ${String(busyTimeout)})`,
        }),
      );
    }

    const synchronous = yield* readNumericPragma(client, "synchronous");
    if (synchronous !== 2) {
      return yield* Effect.fail(
        new DatabasePragmaError({
          pragma: "synchronous",
          expected: "2 (FULL)",
          actual: synchronous,
          cause: undefined,
          message: `SQLite synchronous mode was not FULL (received ${String(synchronous)})`,
        }),
      );
    }
  }).pipe(
    Effect.catchAllDefect((cause) =>
      Effect.fail(
        new DatabaseOpenError({
          path: client.config.filename,
          cause,
          message: `Could not configure the Optimus SQLite connection: ${client.config.filename}`,
        }),
      ),
    ),
    Effect.mapError((cause) =>
      cause instanceof DatabasePragmaError
        ? cause
        : new DatabaseOpenError({
            path: client.config.filename,
            cause,
            message: `Could not configure the Optimus SQLite connection: ${client.config.filename}`,
          }),
    ),
  );

export const makeSqliteClient = (config: DatabaseConfig) =>
  Effect.gen(function* () {
    const client = yield* openClient(config);
    yield* secureDatabaseFile(config.databasePath);
    yield* configurePragmas(client);
    return client;
  });

export const SqliteClientLive = Layer.scopedContext(
  Effect.gen(function* () {
    const config = yield* DatabaseConfig;
    const client = yield* makeSqliteClient(config);
    return Context.make(Sqlite.SqliteClient, client).pipe(Context.add(SqlClient.SqlClient, client));
  }),
);
