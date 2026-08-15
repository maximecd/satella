import * as Effect from "effect/Effect";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import { engineTestLayer } from "../database.test-utils.js";

describe("portfolio domain model unification", () => {
  it.effect("exposes asset categories, optional connection ownership, and no account kind", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const assetColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(assets)`;
      const accountColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(accounts)`;
      const tables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`;
      const usd = yield* sql<{ readonly asset_category: string }>`
        SELECT asset_category FROM assets WHERE id = 'fiat:USD'`;

      const timestamp = "2026-01-01T00:00:00.000Z";
      yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
        VALUES ('sec-1', 'stocks_etfs', 'Apple', 'AAPL', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO connections (id, name, connector_id, config_json, created_at, updated_at)
        VALUES ('ibkr', 'IBKR', 'ibkr', '{}', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO accounts
        (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('manual', NULL, 'Livret A', 'fiat:EUR', NULL, ${timestamp}, ${timestamp}),
               ('connected', 'ibkr', 'Portfolio', 'fiat:USD', 'U1', ${timestamp}, ${timestamp})`;

      const connectedWithoutIdentity = yield* sql`
        INSERT INTO accounts
          (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('bad-connected', 'ibkr', 'Broken', 'fiat:USD', NULL, ${timestamp}, ${timestamp})`.pipe(
        Effect.flip,
      );
      const manualWithIdentity = yield* sql`
        INSERT INTO accounts
          (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('bad-manual', NULL, 'Broken', 'fiat:USD', 'ext-1', ${timestamp}, ${timestamp})`.pipe(
        Effect.flip,
      );
      const nonCashBase = yield* sql`
        INSERT INTO accounts
          (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('bad-currency', NULL, 'Broken', 'sec-1', NULL, ${timestamp}, ${timestamp})`.pipe(
        Effect.flip,
      );
      const rejected = yield* sql<{ readonly id: string }>`
        SELECT id FROM accounts WHERE id LIKE 'bad-%'`;

      expect(assetColumns.map(({ name }) => name)).toContain("asset_category");
      expect(assetColumns.map(({ name }) => name)).not.toContain("asset_class");
      expect(accountColumns.map(({ name }) => name)).toEqual([
        "id",
        "connection_id",
        "name",
        "base_currency_asset_id",
        "connector_account_id",
        "created_at",
        "updated_at",
      ]);
      expect(tables.map(({ name }) => name)).toContain("connections");
      expect(tables.map(({ name }) => name)).not.toContain("custodians");
      expect(tables.map(({ name }) => name)).not.toContain("custodian_connectors");
      expect(usd).toEqual([{ asset_category: "cash" }]);
      expect(connectedWithoutIdentity).toBeDefined();
      expect(manualWithIdentity).toBeDefined();
      expect(nonCashBase).toBeDefined();
      expect(rejected).toEqual([]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
