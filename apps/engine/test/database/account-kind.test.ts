import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";
import type { MigrationRegistry } from "@engine/database";
import { initialFinanceModel } from "@engine/database/migrations/0001_initial_finance_model.js";
import { seedDefaultFiatCurrencies } from "@engine/database/migrations/0002_seed_default_fiat_currencies.js";
import { addAccountSourceDate } from "@engine/database/migrations/0003_account_source_date.js";
import { addAccountKindAndSystemRoles } from "@engine/database/migrations/0004_account_kind_and_system_roles.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const through0003: MigrationRegistry = {
  "0001_initial_finance_model": initialFinanceModel,
  "0002_seed_default_fiat_currencies": seedDefaultFiatCurrencies,
  "0003_account_source_date": addAccountSourceDate,
};

const through0004: MigrationRegistry = {
  ...through0003,
  "0004_account_kind_and_system_roles": addAccountKindAndSystemRoles,
};

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

describe("account kind backfill", () => {
  it("classifies legacy accounts from connector identity and position composition", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-account-kind-"));
    directories.push(directory);

    await runDatabase(
      directory,
      through0003,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const timestamp = new Date().toISOString();
        yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
          VALUES ('ibkr', 'IBKR', 'synced', ${timestamp}, ${timestamp}),
                 ('okx', 'OKX', 'synced', ${timestamp}, ${timestamp}),
                 ('bank', 'Bank', 'manual', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO custodian_connectors
          (custodian_id, connector_id, config_json, created_at, updated_at)
          VALUES ('ibkr', 'ibkr', '{}', ${timestamp}, ${timestamp}),
                 ('okx', 'okx', '{}', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO accounts
          (id, custodian_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
          VALUES ('ibkr-account', 'ibkr', 'Portfolio', 'fiat:USD', 'U1', ${timestamp}, ${timestamp}),
                 ('okx-account', 'okx', 'Trading', 'fiat:USD', 'trading', ${timestamp}, ${timestamp}),
                 ('securities-account', 'bank', 'PEA', 'fiat:EUR', NULL, ${timestamp}, ${timestamp}),
                 ('crypto-account', 'bank', 'Wallet', 'fiat:USD', NULL, ${timestamp}, ${timestamp}),
                 ('cash-account', 'bank', 'Checking', 'fiat:USD', NULL, ${timestamp}, ${timestamp}),
                 ('mixed-account', 'bank', 'Mixed', 'fiat:USD', NULL, ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
          VALUES ('sec-1', 'security', 'Apple', 'AAPL', ${timestamp}, ${timestamp}),
                 ('cry-1', 'crypto', 'Bitcoin', 'BTC', ${timestamp}, ${timestamp}),
                 ('cus-1', 'custom', 'Watch', NULL, ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
          VALUES ('p1', 'securities-account', 'sec-1', 1, ${timestamp}, ${timestamp}),
                 ('p2', 'securities-account', 'fiat:EUR', 10, ${timestamp}, ${timestamp}),
                 ('p3', 'crypto-account', 'cry-1', 1, ${timestamp}, ${timestamp}),
                 ('p4', 'cash-account', 'fiat:USD', 50, ${timestamp}, ${timestamp}),
                 ('p5', 'mixed-account', 'sec-1', 1, ${timestamp}, ${timestamp}),
                 ('p6', 'mixed-account', 'cry-1', 1, ${timestamp}, ${timestamp})`;
      }),
    );

    const kinds = await runDatabase(
      directory,
      through0004,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly id: string; readonly account_kind: string }>`
          SELECT id, account_kind FROM accounts ORDER BY id`;
      }),
    );

    expect(kinds).toEqual([
      { id: "cash-account", account_kind: "current" },
      { id: "crypto-account", account_kind: "crypto" },
      { id: "ibkr-account", account_kind: "securities" },
      { id: "mixed-account", account_kind: "other" },
      { id: "okx-account", account_kind: "crypto" },
      { id: "securities-account", account_kind: "securities" },
    ]);
  });
});
