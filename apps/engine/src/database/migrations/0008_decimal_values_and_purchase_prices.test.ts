import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";

import { engineTestLayer } from "../database.test-utils.js";

describe("decimal values and purchase prices", () => {
  it.effect("exposes the final five-category schema and paired decimal purchase fields", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const assetSchema = yield* sql<{ readonly sql: string }>`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'assets'`;
      const positionColumns = yield* sql<{
        readonly name: string;
        readonly type: string;
      }>`PRAGMA table_info(positions)`;

      expect(assetSchema[0]?.sql).toContain("'stocks_etfs', 'bonds', 'crypto', 'cash', 'other'");
      expect(assetSchema[0]?.sql).not.toContain("derivatives");
      expect(assetSchema[0]?.sql).not.toContain("commodities");
      expect(positionColumns.find(({ name }) => name === "quantity")?.type).toBe("TEXT");
      expect(
        positionColumns.find(({ name }) => name === "manual_average_unit_purchase_price")?.type,
      ).toBe("TEXT");
      expect(
        positionColumns.find(({ name }) => name === "connection_average_unit_purchase_price")?.type,
      ).toBe("TEXT");

      const timestamp = "2026-08-11T00:00:00.000Z";
      yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
        VALUES ('test-asset', 'other', 'Test asset', 'TEST', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO accounts
        (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('test-account', NULL, 'Test account', 'fiat:USD', NULL, ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO positions
        (id, account_id, asset_id, quantity, manual_average_unit_purchase_price,
         manual_purchase_currency_asset_id, created_at, updated_at)
        VALUES ('test-position', 'test-account', 'test-asset', '0.00000000000000000001',
          '12345678901234567890.123456789', 'fiat:EUR', ${timestamp}, ${timestamp})`;

      const stored = yield* sql<{
        readonly quantity: string;
        readonly average: string | null;
        readonly quantity_type: string;
        readonly average_type: string | null;
      }>`SELECT quantity, manual_average_unit_purchase_price AS average,
          typeof(quantity) AS quantity_type, typeof(manual_average_unit_purchase_price) AS average_type
        FROM positions WHERE id = 'test-position'`;
      expect(stored).toEqual([
        {
          quantity: "0.00000000000000000001",
          average: "12345678901234567890.123456789",
          quantity_type: "text",
          average_type: "text",
        },
      ]);

      const invalidCategory = yield* sql`
        INSERT INTO assets (id, asset_category, name, created_at, updated_at)
        VALUES ('invalid-category', 'derivatives', 'Invalid', ${timestamp}, ${timestamp})`.pipe(
        Effect.flip,
      );
      const unpairedPurchaseCurrency = yield* sql`
        INSERT INTO positions
          (id, account_id, asset_id, quantity, manual_purchase_currency_asset_id, created_at, updated_at)
        VALUES ('unpaired-position', 'test-account', 'test-asset', '1', 'fiat:USD', ${timestamp}, ${timestamp})`.pipe(
        Effect.flip,
      );
      expect(invalidCategory).toBeDefined();
      expect(unpairedPurchaseCurrency).toBeDefined();
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
