import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import { reconcileConnectorAccounts } from "../connector-service.js";
import * as Finance from "../finance.test-utils.js";

describe("connections", () => {
  it.effect("stores connector credentials for later refresh", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO connections
        (id, name, connector_id, config_json, created_at, updated_at)
        VALUES ('okx', 'OKX', 'okx', ${JSON.stringify({
          apiKey: "api-key",
          secretKey: "secret-key",
          passphrase: "passphrase",
          region: "global",
        })}, ${timestamp}, ${timestamp})`;
      const connection = yield* Finance.getConnection("okx");
      const rows = yield* sql<{ readonly config_json: string }>`SELECT config_json
          FROM connections WHERE id = ${connection.id}`;
      expect(JSON.parse(rows[0]!.config_json)).toEqual({
        apiKey: "api-key",
        secretKey: "secret-key",
        passphrase: "passphrase",
        region: "global",
      });
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("creates standalone accounts without a connection", () =>
    Effect.gen(function* () {
      const checking = yield* Finance.createAccount({ name: "Checking" });
      const savings = yield* Finance.createAccount({
        name: "Savings",
        baseCurrencyAssetId: "fiat:USD",
      });
      expect(checking.connectionId).toBeNull();
      expect(checking.baseCurrencyIso).toBe("USD");
      expect(savings.baseCurrencyIso).toBe("USD");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects connect without a registered connector and protects connected writes", () =>
    Effect.gen(function* () {
      const missingConnector = yield* Finance.connectConnection({
        name: "Synced",
        connectorId: "fake",
        credentials: { token: "x" },
      }).pipe(Effect.flip);
      expect(missingConnector.message).toContain("No registered connector");

      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO connections (id, name, connector_id, config_json, created_at, updated_at)
        VALUES ('synced', 'Fixture', 'test-only', '{}', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO accounts
        (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('synced-account', 'synced', 'External', 'fiat:USD', 'upstream-1', ${timestamp}, ${timestamp})`;
      const readOnly = yield* Finance.updateAccount("synced-account", {
        name: "Changed",
        baseCurrencyAssetId: "fiat:USD",
      }).pipe(Effect.flip);
      expect(readOnly.message).toContain("read-only");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("captures a new Portfolio snapshot after a successful Connection refresh", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO connections (id, name, connector_id, config_json, created_at, updated_at)
        VALUES ('okx', 'OKX', 'okx', ${JSON.stringify({ token: "x" })}, ${timestamp}, ${timestamp})`;
      yield* reconcileConnectorAccounts("okx", [
        {
          externalId: "trading",
          name: "Trading",
          baseCurrencyIso: "USD",
          positions: [
            {
              asset: {
                externalId: "okx:currency:BTC",
                assetCategory: "crypto",
                name: "BTC",
                symbol: "BTC",
                identifiers: [{ type: "okx_currency", value: "BTC" }],
              },
              quantity: "1",
            },
          ],
        },
      ]);
      const first = yield* Finance.completeConnectionRefresh("okx", {
        refresh: false,
        now: () => new Date("2026-08-11T08:00:00.000Z"),
      });
      const second = yield* Finance.completeConnectionRefresh("okx", {
        refresh: false,
        now: () => new Date("2026-08-11T18:00:00.000Z"),
      });
      const history = yield* Finance.getPortfolioHistory();
      expect(first.connection.accounts).toHaveLength(1);
      expect(second.failures).toEqual([]);
      expect(history.map(({ capturedAt }) => capturedAt)).toEqual([
        "2026-08-11T08:00:00.000Z",
        "2026-08-11T18:00:00.000Z",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
