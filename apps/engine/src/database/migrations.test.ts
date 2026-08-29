import * as Effect from "effect/Effect";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import type { MigrationRegistry } from "./index.js";
import { ProductionMigrations } from "./migrations.js";
import { initialFinanceModel } from "./migrations/20260821194600_initial_finance_model.js";
import { addAppLanguage } from "./migrations/20260822165422_add_app_language.js";
import { addSyncLog } from "./migrations/20260823081447_add_sync_log.js";
import { addEvmRpcSettings } from "./migrations/20260823084456_add_evm_rpc_settings.js";
import { allowOptionalSyncLogFailureReason } from "./migrations/20260823090830_allow_optional_sync_log_failure_reason.js";
import { addManualDebts } from "./migrations/20260829094515_add_manual_debts.js";
import { addMcpToken } from "./migrations/20260829190511_add_mcp_token.js";
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
    yield* sql`CREATE TABLE snapshots (
    id TEXT PRIMARY KEY,
    captured_at TEXT NOT NULL UNIQUE
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
      "20260823081447_add_sync_log",
      "20260823084456_add_evm_rpc_settings",
      "20260823090830_allow_optional_sync_log_failure_reason",
      "20260829094515_add_manual_debts",
      "20260829190336_add_goals",
      "20260829190511_add_mcp_token",
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
      const oldSyncLogTable = yield* scopedCustomMigrations(
        oldDirectory,
        ProductionMigrations,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ readonly name: string }>`SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'sync_log'`;
        }),
      );
      expect(oldSyncLogTable).toEqual([{ name: "sync_log" }]);
      const oldOptionalFailure = yield* scopedCustomMigrations(
        oldDirectory,
        ProductionMigrations,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO sync_log
            (id, completed_at, subject_kind, subject_name, action, outcome, failure_reason)
            VALUES ('optional-failure', '2026-08-01T00:00:00.000Z', 'asset', 'Asset',
              'price_check', 'failure', NULL)`;
          return yield* sql<{ readonly id: string }>`SELECT id FROM sync_log
            WHERE id = 'optional-failure'`;
        }),
      );
      expect(oldOptionalFailure).toEqual([{ id: "optional-failure" }]);

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
      const newSyncLogTable = yield* scopedCustomMigrations(
        newDirectory,
        ProductionMigrations,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ readonly name: string }>`SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'sync_log'`;
        }),
      );
      expect(newSyncLogTable).toEqual([{ name: "sync_log" }]);
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

describe("manual debts migration", () => {
  const lastReleasedSchemaBeforeDebts: MigrationRegistry = {
    "20260821194600_initial_finance_model": initialFinanceModel,
    "20260822165422_add_app_language": addAppLanguage,
    "20260823081447_add_sync_log": addSyncLog,
    "20260823084456_add_evm_rpc_settings": addEvmRpcSettings,
    "20260823090830_allow_optional_sync_log_failure_reason": allowOptionalSyncLogFailureReason,
  };

  const insertDebt = (
    id: string,
    name: string,
    kind: string,
    amount: string,
    currencyAssetId: string,
    dueDate: string | null,
  ) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO debts
        (id, name, kind, amount, currency_asset_id, due_date, created_at, updated_at)
        VALUES (${id}, ${name}, ${kind}, ${amount}, ${currencyAssetId}, ${dueDate},
          '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z')`;
    });

  it.effect("creates the debts table and the snapshot debt total on a fresh Vault", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      const inserted = yield* scopedCustomMigrations(
        directory,
        ProductionMigrations,
        Effect.gen(function* () {
          yield* insertDebt("debt-1", "Income tax", "tax", "4000", "fiat:EUR", "2026-09-15");
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO snapshots (id, captured_at, total_debt)
            VALUES ('snap-1', '2026-08-29T00:00:00.000Z', '4000')`;
          return yield* sql`SELECT name, kind, amount, currency_asset_id, due_date
            FROM debts WHERE id = 'debt-1'`;
        }),
      );
      expect(inserted).toEqual([
        {
          name: "Income tax",
          kind: "tax",
          amount: "4000",
          currency_asset_id: "fiat:EUR",
          due_date: "2026-09-15",
        },
      ]);
      const constraints = yield* scopedCustomMigrations(
        directory,
        ProductionMigrations,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
            VALUES ('asset:art', 'other', 'Art', NULL,
              '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z')`;
          const badKind = yield* insertDebt(
            "debt-2",
            "Mystery",
            "penalty",
            "10",
            "fiat:USD",
            null,
          ).pipe(Effect.result);
          const badDueDate = yield* insertDebt(
            "debt-3",
            "Loan",
            "loan",
            "10",
            "fiat:USD",
            "2026/09/15",
          ).pipe(Effect.result);
          const nonCashCurrency = yield* insertDebt(
            "debt-4",
            "Loan",
            "loan",
            "10",
            "asset:art",
            null,
          ).pipe(Effect.result);
          return { badKind, badDueDate, nonCashCurrency };
        }),
      );
      expect(constraints.badKind._tag).toBe("Failure");
      expect(constraints.badDueDate._tag).toBe("Failure");
      expect(constraints.nonCashCurrency._tag).toBe("Failure");
    }).pipe(Effect.provide(Reactivity.layer)),
  );

  it.effect("upgrades the last released schema and leaves old snapshots without a debt total", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(
        directory,
        lastReleasedSchemaBeforeDebts,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO snapshots (id, captured_at)
            VALUES ('snap-old', '2026-08-01T00:00:00.000Z')`;
        }),
      );
      const upgraded = yield* scopedCustomMigrations(
        directory,
        ProductionMigrations,
        Effect.gen(function* () {
          yield* insertDebt("debt-1", "Consumer loan", "loan", "1500.50", "fiat:USD", null);
          const sql = yield* SqlClient.SqlClient;
          return {
            debts: yield* sql`SELECT count(*) AS count FROM debts`,
            snapshots: yield* sql`SELECT id, captured_at, total_debt FROM snapshots`,
          };
        }),
      );
      expect(upgraded.debts).toEqual([{ count: 1 }]);
      expect(upgraded.snapshots).toEqual([
        { id: "snap-old", captured_at: "2026-08-01T00:00:00.000Z", total_debt: null },
      ]);
    }).pipe(Effect.provide(Reactivity.layer)),
  );
});

describe("goals migration", () => {
  const lastReleasedSchemaBeforeGoals: MigrationRegistry = {
    "20260821194600_initial_finance_model": initialFinanceModel,
    "20260822165422_add_app_language": addAppLanguage,
    "20260823081447_add_sync_log": addSyncLog,
    "20260823084456_add_evm_rpc_settings": addEvmRpcSettings,
    "20260823090830_allow_optional_sync_log_failure_reason": allowOptionalSyncLogFailureReason,
    "20260829094515_add_manual_debts": addManualDebts,
  };

  const insertGoal = (
    id: string,
    name: string,
    amount: string,
    currencyAssetId: string,
    targetDate: string | null,
  ) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO goals
        (id, name, amount, currency_asset_id, target_date, created_at, updated_at)
        VALUES (${id}, ${name}, ${amount}, ${currencyAssetId}, ${targetDate},
          '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z')`;
    });

  it.effect("creates the goals tables on a fresh Vault", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      const inserted = yield* scopedCustomMigrations(
        directory,
        ProductionMigrations,
        Effect.gen(function* () {
          yield* insertGoal("goal-1", "Buy a car", "15000", "fiat:EUR", "2026-09-15");
          const sql = yield* SqlClient.SqlClient;
          return yield* sql`SELECT name, amount, currency_asset_id, target_date
            FROM goals WHERE id = 'goal-1'`;
        }),
      );
      expect(inserted).toEqual([
        {
          name: "Buy a car",
          amount: "15000",
          currency_asset_id: "fiat:EUR",
          target_date: "2026-09-15",
        },
      ]);
      const constraints = yield* scopedCustomMigrations(
        directory,
        ProductionMigrations,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
            VALUES ('asset:art', 'other', 'Art', NULL,
              '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z')`;
          const badName = yield* insertGoal("goal-2", "   ", "10", "fiat:USD", null).pipe(
            Effect.result,
          );
          const badTargetDate = yield* insertGoal(
            "goal-3",
            "Car",
            "10",
            "fiat:USD",
            "2026/09/15",
          ).pipe(Effect.result);
          const nonCashCurrency = yield* insertGoal("goal-4", "Car", "10", "asset:art", null).pipe(
            Effect.result,
          );
          yield* insertGoal("goal-5", "Car", "10", "fiat:USD", null);
          yield* insertGoal("goal-6", "Emergency", "10", "fiat:USD", null);
          yield* sql`INSERT INTO goal_accounts (goal_id, account_id)
            VALUES ('goal-5', 'account:manual')`;
          const sharedAccount = yield* sql`INSERT INTO goal_accounts (goal_id, account_id)
            VALUES ('goal-6', 'account:manual')`.pipe(Effect.result);
          return { badName, badTargetDate, nonCashCurrency, sharedAccount };
        }),
      );
      expect(constraints.badName._tag).toBe("Failure");
      expect(constraints.badTargetDate._tag).toBe("Failure");
      expect(constraints.nonCashCurrency._tag).toBe("Failure");
      expect(constraints.sharedAccount._tag).toBe("Failure");
    }).pipe(Effect.provide(Reactivity.layer)),
  );

  it.effect("upgrades the last released schema and accepts a new Goal", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(
        directory,
        lastReleasedSchemaBeforeGoals,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO snapshots (id, captured_at, total_debt)
            VALUES ('snap-old', '2026-08-01T00:00:00.000Z', '0')`;
        }),
      );
      const upgraded = yield* scopedCustomMigrations(
        directory,
        ProductionMigrations,
        Effect.gen(function* () {
          yield* insertGoal("goal-1", "Buy a car", "15000", "fiat:USD", null);
          const sql = yield* SqlClient.SqlClient;
          return yield* sql`SELECT count(*) AS count FROM goals`;
        }),
      );
      expect(upgraded).toEqual([{ count: 1 }]);
    }).pipe(Effect.provide(Reactivity.layer)),
  );
});

describe("MCP token migration", () => {
  const lastReleasedSchemaBeforeMcpToken: MigrationRegistry = {
    "20260821194600_initial_finance_model": initialFinanceModel,
    "20260822165422_add_app_language": addAppLanguage,
    "20260823081447_add_sync_log": addSyncLog,
    "20260823084456_add_evm_rpc_settings": addEvmRpcSettings,
    "20260823090830_allow_optional_sync_log_failure_reason": allowOptionalSyncLogFailureReason,
    "20260829094515_add_manual_debts": addManualDebts,
  };

  it.effect("adds nullable MCP token columns on a fresh Vault", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      const columns = yield* scopedCustomMigrations(
        directory,
        ProductionMigrations,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ readonly name: string }>`PRAGMA table_info(vault_security)`;
        }),
      );
      expect(columns.map(({ name }) => name)).toEqual(
        expect.arrayContaining(["mcp_token_salt", "mcp_token_hash"]),
      );
    }).pipe(Effect.provide(Reactivity.layer)),
  );

  it.effect("upgrades the last released schema without requiring an existing MCP token", () =>
    Effect.gen(function* () {
      const directory = yield* acquireTestDirectory;
      yield* scopedCustomMigrations(
        directory,
        lastReleasedSchemaBeforeMcpToken,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO vault_security
            (id, pin_salt, pin_hash, screen_lock_timeout_minutes, created_at, updated_at)
            VALUES (1, 'c2FsdA==', 'hash', 15, '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z')`;
        }),
      );
      const upgraded = yield* scopedCustomMigrations(
        directory,
        {
          ...lastReleasedSchemaBeforeMcpToken,
          "20260829190511_add_mcp_token": addMcpToken,
        },
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{
            readonly mcp_token_salt: string | null;
            readonly mcp_token_hash: string | null;
          }>`SELECT mcp_token_salt, mcp_token_hash FROM vault_security WHERE id = 1`;
        }),
      );
      expect(upgraded).toEqual([{ mcp_token_salt: null, mcp_token_hash: null }]);
    }).pipe(Effect.provide(Reactivity.layer)),
  );
});
