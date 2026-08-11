import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Database from "better-sqlite3";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";
import type { MigrationRegistry } from "@engine/database";

const directories: string[] = [];

const newDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "optimus-engine-"));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const runDatabase = <A>(
  directory: string,
  migrations: MigrationRegistry,
  program: Effect.Effect<A, unknown, SqlClient.SqlClient>,
) =>
  Effect.runPromise(
    Effect.scoped(
      program.pipe(
        Effect.provide(
          makeDatabaseLive({ migrations }).pipe(
            Layer.provide(DatabaseConfigFromDirectory(directory)),
          ),
        ),
      ),
    ),
  );

const createRecords: MigrationRegistry = {
  "0001_create_records": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`;
    yield* sql`INSERT INTO records (id, value) VALUES (1, 'original')`;
  }),
};

const addCurrency: MigrationRegistry = {
  ...createRecords,
  "0002_add_currency": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`ALTER TABLE records ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'`;
    yield* sql`UPDATE records SET currency = 'USD' WHERE id = 1`;
  }),
};

const rebuildRecords: MigrationRegistry = {
  ...addCurrency,
  "0003_rebuild_records": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE records_new (id INTEGER PRIMARY KEY, value TEXT NOT NULL, currency TEXT NOT NULL)`;
    yield* sql`INSERT INTO records_new (id, value, currency) SELECT id, value, currency FROM records`;
    yield* sql`DROP TABLE records`;
    yield* sql`ALTER TABLE records_new RENAME TO records`;
  }),
};

describe("SQLite migration startup", () => {
  it("creates the database ledger and runs migrations once across restart", async () => {
    const directory = await newDirectory();

    await runDatabase(
      directory,
      createRecords,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql`SELECT id, value FROM records`;
      }),
    );

    const secondRun = await runDatabase(
      directory,
      createRecords,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql`SELECT id, value FROM records`;
      }),
    );

    expect(secondRun).toEqual([{ id: 1, value: "original" }]);
    const db = new Database(join(directory, "optimus.sqlite"));
    expect(db.prepare("SELECT migration_id, name FROM effect_sql_migrations").all()).toEqual([
      { migration_id: 1, name: "create_records" },
    ]);
    db.close();
    expect(await readdir(join(directory, "backups"))).toEqual([]);
  });

  it("preserves rows through an additive and table-rebuild migration and backs up the old schema", async () => {
    const directory = await newDirectory();

    await runDatabase(directory, createRecords, Effect.void);
    const rows = await runDatabase(
      directory,
      rebuildRecords,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql`SELECT id, value, currency FROM records`;
      }),
    );

    expect(rows).toEqual([{ id: 1, value: "original", currency: "USD" }]);
    const backups = (await readdir(join(directory, "backups"))).filter((name) =>
      name.endsWith(".sqlite"),
    );
    expect(backups).toHaveLength(1);

    const backup = new Database(join(directory, "backups", backups[0]!));
    expect(backup.prepare("SELECT id, value FROM records").all()).toEqual([
      { id: 1, value: "original" },
    ]);
    expect(
      backup
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'records_new'")
        .all(),
    ).toEqual([]);
    backup.close();
  });

  it("rolls back a failing migration and its ledger row", async () => {
    const directory = await newDirectory();
    await runDatabase(directory, createRecords, Effect.void);

    const failing: MigrationRegistry = {
      ...createRecords,
      "0002_fail": Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE records SET value = 'changed' WHERE id = 1`;
        yield* Effect.fail("intentional migration failure");
      }),
    };

    await expect(runDatabase(directory, failing, Effect.void)).rejects.toThrow(
      "SQLite migrations failed; the migration transaction was rolled back",
    );

    const db = new Database(join(directory, "optimus.sqlite"));
    expect(db.prepare("SELECT id, value FROM records").all()).toEqual([
      { id: 1, value: "original" },
    ]);
    expect(db.prepare("SELECT migration_id, name FROM effect_sql_migrations").all()).toEqual([
      { migration_id: 1, name: "create_records" },
    ]);
    db.close();
  });

  it("rejects edited, removed, duplicate, and newer-than-binary histories", async () => {
    const directory = await newDirectory();
    await runDatabase(directory, createRecords, Effect.void);

    const renamed: MigrationRegistry = {
      "0001_renamed_records": createRecords["0001_create_records"]!,
    };
    await expect(runDatabase(directory, renamed, Effect.void)).rejects.toThrow(
      "The SQLite migration history is not an exact prefix of the running binary",
    );

    await expect(runDatabase(directory, {}, Effect.void)).rejects.toThrow(
      "The SQLite database was created by a newer Optimus schema",
    );

    const duplicate: MigrationRegistry = {
      "0001_first": Effect.void,
      "1_second": Effect.void,
    };
    await expect(runDatabase(directory, duplicate, Effect.void)).rejects.toThrow(
      "Migration registry contains an invalid or duplicate id",
    );
  });

  it("enforces foreign keys and validates the database after migrations", async () => {
    const directory = await newDirectory();
    const foreignKeys: MigrationRegistry = {
      "0001_create_foreign_keys": Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`CREATE TABLE parents (id INTEGER PRIMARY KEY)`;
        yield* sql`CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parents(id))`;
        yield* sql`INSERT INTO parents (id) VALUES (1)`;
        yield* sql`INSERT INTO children (id, parent_id) VALUES (1, 1)`;
      }),
    };

    const foreignKeyStatus = await runDatabase(
      directory,
      foreignKeys,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql`PRAGMA foreign_keys`;
        return rows;
      }),
    );

    expect(foreignKeyStatus).toEqual([{ foreign_keys: 1 }]);
  });
});
