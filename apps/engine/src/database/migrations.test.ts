import * as Effect from "effect/Effect";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import type { MigrationRegistry } from "./index.js";
import { ProductionMigrations } from "./migrations.js";
import { TempDirectoryError } from "./DatabaseTestLayer.js";
import {
  acquireTestDirectory,
  dekForDirectory,
  scopedCustomMigrations,
} from "./database.test-utils.js";
import { makeEncryptedSqliteClient } from "./encrypted-client.js";
import { Reactivity } from "effect/unstable/reactivity";
import { getSettings } from "../finance/settings/SettingsSql.js";

const readEncrypted = <A, E>(
  dataDirectory: string,
  filename: string,
  program: Effect.Effect<A, E, SqlClient.SqlClient>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeEncryptedSqliteClient({
        filename,
        dek: dekForDirectory(dataDirectory),
      });
      return yield* program.pipe(Effect.provideService(SqlClient.SqlClient, client));
    }).pipe(Effect.provide(Reactivity.layer)),
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

const releasedInitialSchemaWithoutAppLanguage: MigrationRegistry = {
  "20260821194600_initial_finance_model": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE assets (
      id TEXT PRIMARY KEY,
      asset_category TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT
    ) STRICT`;
    yield* sql`CREATE TABLE asset_identifiers (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      identifier_type TEXT NOT NULL,
      identifier_value TEXT NOT NULL
    ) STRICT`;
    yield* sql`CREATE TABLE app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      reporting_currency_asset_id TEXT NOT NULL REFERENCES assets(id)
    ) STRICT`;
    yield* sql`INSERT INTO assets (id, asset_category, name, symbol)
      VALUES ('fiat:USD', 'cash', 'US dollar', 'USD')`;
    yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
      VALUES ('identifier:iso:USD', 'fiat:USD', 'iso_currency', 'USD')`;
    yield* sql`INSERT INTO app_settings (id, reporting_currency_asset_id)
      VALUES (1, 'fiat:USD')`;
  }),
};

describe("SQLite migration startup", () => {
  it("registers production migrations in timestamp order", () => {
    expect(Object.keys(ProductionMigrations)).toEqual([
      "20260821194600_initial_finance_model",
      "20260822165422_add_app_language",
      "20260823084456_add_evm_rpc_settings",
    ]);
  });

  it.effect("creates the database ledger and runs migrations once across restart", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(
        directory,
        createRecords,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql`SELECT id, value FROM records`;
        }),
      );
      const secondRun = yield* scopedCustomMigrations(
        directory,
        createRecords,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql`SELECT id, value FROM records`;
        }),
      );
      expect(secondRun).toEqual([{ id: 1, value: "original" }]);
      const history = yield* scopedCustomMigrations(
        directory,
        createRecords,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql`SELECT migration_id, name FROM effect_sql_migrations`;
        }),
      );
      expect(history).toEqual([{ migration_id: 1, name: "create_records" }]);
      const backups = yield* Effect.tryPromise({
        try: () => readdir(join(directory, "backups")),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      expect(backups).toEqual([]);
    }),
  );

  it.effect("upgrades the released schema before Settings queries app_language", () =>
    Effect.gen(function* () {
      const oldDirectory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(
        oldDirectory,
        releasedInitialSchemaWithoutAppLanguage,
        Effect.void,
      );

      const oldSettings = yield* scopedCustomMigrations(
        oldDirectory,
        ProductionMigrations,
        getSettings(),
      );

      expect(oldSettings.language).toBe("en");
      expect(oldSettings.reportingCurrency.iso).toBe("USD");

      const newDirectory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(
        newDirectory,
        releasedInitialSchemaWithoutAppLanguage,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`ALTER TABLE app_settings ADD COLUMN app_language TEXT NOT NULL DEFAULT 'en'
            CHECK (app_language IN ('en', 'fr'))`;
          yield* sql`UPDATE app_settings SET app_language = 'fr' WHERE id = 1`;
        }),
      );

      const newSettings = yield* scopedCustomMigrations(
        newDirectory,
        ProductionMigrations,
        getSettings(),
      );

      expect(newSettings.language).toBe("fr");
      expect(newSettings.reportingCurrency.iso).toBe("USD");
    }),
  );

  it.effect(
    "preserves rows through an additive and table-rebuild migration and backs up the old schema",
    () =>
      Effect.gen(function* () {
        const directory = yield* acquireTestDirectory;
        yield* scopedCustomMigrations(directory, createRecords, Effect.void);
        const rows = yield* scopedCustomMigrations(
          directory,
          rebuildRecords,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            return yield* sql`SELECT id, value, currency FROM records`;
          }),
        );
        expect(rows).toEqual([{ id: 1, value: "original", currency: "USD" }]);
        const backups = yield* Effect.tryPromise({
          try: () => readdir(join(directory, "backups")),
          catch: (cause) => new TempDirectoryError({ cause }),
        });
        const sqliteBackups = backups.filter((name) => name.endsWith(".sqlite"));
        expect(sqliteBackups).toHaveLength(1);
        const backupState = yield* readEncrypted(
          directory,
          join(directory, "backups", sqliteBackups[0]!),
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            return {
              rows: yield* sql`SELECT id, value FROM records`,
              rebuilt:
                yield* sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'records_new'`,
            };
          }),
        );
        expect(backupState.rows).toEqual([{ id: 1, value: "original" }]);
        expect(backupState.rebuilt).toEqual([]);
      }),
  );

  it.effect("rolls back a failing migration and its ledger row", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(directory, createRecords, Effect.void);
      const failing: MigrationRegistry = {
        ...createRecords,
        "0002_fail": Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`UPDATE records SET value = 'changed' WHERE id = 1`;
          return yield* Effect.fail("intentional migration failure");
        }),
      };
      const error = yield* scopedCustomMigrations(directory, failing, Effect.void).pipe(
        Effect.flip,
      );
      expect(String(error)).toContain(
        "SQLite migrations failed; the migration transaction was rolled back",
      );
      const state = yield* readEncrypted(
        directory,
        join(directory, "satella.sqlite"),
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return {
            rows: yield* sql`SELECT id, value FROM records`,
            history: yield* sql`SELECT migration_id, name FROM effect_sql_migrations`,
          };
        }),
      );
      expect(state.rows).toEqual([{ id: 1, value: "original" }]);
      expect(state.history).toEqual([{ migration_id: 1, name: "create_records" }]);
    }),
  );

  it.effect("rejects edited, removed, duplicate, and newer-than-binary histories", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(directory, createRecords, Effect.void);
      const renamed: MigrationRegistry = {
        "0001_renamed_records": createRecords["0001_create_records"]!,
      };
      const renamedError = yield* scopedCustomMigrations(directory, renamed, Effect.void).pipe(
        Effect.flip,
      );
      expect(String(renamedError)).toContain(
        "The SQLite migration history is not an exact prefix of the running binary",
      );
      const emptyError = yield* scopedCustomMigrations(directory, {}, Effect.void).pipe(
        Effect.flip,
      );
      expect(String(emptyError)).toContain(
        "The SQLite database was created by a newer Satella schema",
      );
      const duplicate: MigrationRegistry = {
        "0001_first": Effect.void,
        "1_second": Effect.void,
      };
      const duplicateError = yield* scopedCustomMigrations(directory, duplicate, Effect.void).pipe(
        Effect.flip,
      );
      expect(String(duplicateError)).toContain(
        "Migration registry contains an invalid or duplicate id",
      );
    }),
  );

  it.effect("enforces foreign keys and validates the database after migrations", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      const foreignKeys: MigrationRegistry = {
        "0001_create_foreign_keys": Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`CREATE TABLE parents (id INTEGER PRIMARY KEY)`;
          yield* sql`CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parents(id))`;
          yield* sql`INSERT INTO parents (id) VALUES (1)`;
          yield* sql`INSERT INTO children (id, parent_id) VALUES (1, 1)`;
        }),
      };
      const foreignKeyStatus = yield* scopedCustomMigrations(
        directory,
        foreignKeys,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql`PRAGMA foreign_keys`;
        }),
      );
      expect(foreignKeyStatus).toEqual([{ foreign_keys: 1 }]);
    }),
  );
});
