import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("custodians", () => {
  it.effect("stores connector credentials for later resync", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const custodian = yield* Finance.createCustodian({
        name: "OKX",
        managementMode: "synced",
        connectorId: "okx",
        connectorConfig: {
          apiKey: "api-key",
          secretKey: "secret-key",
          passphrase: "passphrase",
          region: "global",
        },
      });
      const rows = yield* sql<{ readonly config_json: string }>`SELECT config_json
          FROM custodian_connectors WHERE custodian_id = ${custodian.id}`;
      expect(JSON.parse(rows[0]!.config_json)).toEqual({
        apiKey: "api-key",
        secretKey: "secret-key",
        passphrase: "passphrase",
        region: "global",
      });
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("creates manual custodians with several fiat-based accounts", () =>
    Effect.gen(function* () {
      const custodian = yield* Finance.createCustodian({
        name: "My bank",
        managementMode: "manual",
      });
      const checking = yield* Finance.createAccount({
        custodianId: custodian.id,
        name: "Checking",
      });
      const savings = yield* Finance.createAccount({
        custodianId: custodian.id,
        name: "Savings",
        baseCurrencyAssetId: "fiat:USD",
      });
      const listed = yield* Finance.getCustodian(custodian.id);
      expect(listed.accounts).toHaveLength(2);
      expect(checking.baseCurrencyIso).toBe("USD");
      expect(savings.baseCurrencyIso).toBe("USD");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect(
    "rejects synced creation without a registered connector and protects synced writes",
    () =>
      Effect.gen(function* () {
        const missingConnector = yield* Finance.createCustodian({
          name: "Synced",
          managementMode: "synced",
          connectorId: "fake",
        }).pipe(Effect.flip);
        expect(missingConnector.message).toContain("No registered custodian connector");

        const sql = yield* SqlClient.SqlClient;
        const timestamp = new Date().toISOString();
        yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
          VALUES ('synced', 'Fixture', 'synced', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO custodian_connectors
          (custodian_id, connector_id, config_json, created_at, updated_at)
          VALUES ('synced', 'test-only', '{}', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO accounts
          (id, custodian_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
          VALUES ('synced-account', 'synced', 'External', 'fiat:USD', 'upstream-1', ${timestamp}, ${timestamp})`;
        const readOnly = yield* Finance.updateAccount("synced-account", {
          name: "Changed",
          baseCurrencyAssetId: "fiat:USD",
        }).pipe(Effect.flip);
        expect(readOnly.message).toContain("read-only");
      }).pipe(Effect.provide(engineTestLayer())),
  );
});
