import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import { reconcileConnectorAccounts } from "../connector-service.js";
import * as Finance from "../finance.test-utils.js";

describe("custodians", () => {
  it.effect("stores connector credentials for later refresh", () =>
    Effect.gen(function* () {
      yield* Finance.seedSyncedCustodian({
        id: "okx",
        name: "OKX",
        connectorId: "okx",
        credentials: {
          apiKey: "api-key",
          secretKey: "secret-key",
          passphrase: "passphrase",
          region: "global",
        },
      });
      const custodian = yield* Finance.getCustodian("okx");
      expect(custodian.connectorId).toBe("okx");
      expect(custodian.name).toBe("OKX");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("creates manual accounts under a named custodian", () =>
    Effect.gen(function* () {
      const bank = yield* Finance.createCustodian({ name: "BNP Paribas" });
      const checking = yield* Finance.createAccount({
        name: "Checking",
        custodianId: bank.id,
        accountType: "checking",
      });
      const savings = yield* Finance.createAccount({
        name: "Savings",
        custodianId: bank.id,
        accountType: "savings",
        baseCurrencyAssetId: "fiat:USD",
      });
      expect(checking.custodianId).toBe(bank.id);
      expect(checking.baseCurrencyIso).toBe("USD");
      expect(savings.baseCurrencyIso).toBe("USD");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects connect without a registered connector and protects synced writes", () =>
    Effect.gen(function* () {
      const missingConnector = yield* Finance.connectCustodian({
        name: "Synced",
        connectorId: "fake",
        credentials: { token: "x" },
      }).pipe(Effect.flip);
      expect(missingConnector.message).toContain("No registered connector");

      yield* Finance.seedSyncedCustodian({
        id: "synced",
        name: "Fixture",
        connectorId: "test-only",
        accounts: [
          {
            id: "synced-account",
            name: "External",
            connectorAccountId: "upstream-1",
            accountType: "brokerage",
          },
        ],
      });
      const readOnly = yield* Finance.updateAccount("synced-account", {
        name: "Changed",
        baseCurrencyAssetId: "fiat:USD",
      }).pipe(Effect.flip);
      const created = yield* Finance.createPosition({
        accountId: "synced-account",
        assetId: "fiat:USD",
        quantity: "1",
      }).pipe(Effect.flip);
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
        VALUES ('synced-position', 'synced-account', 'fiat:USD', 1, ${timestamp}, ${timestamp})`;
      const quantityUpdate = yield* Finance.updatePosition("synced-position", "2").pipe(
        Effect.flip,
      );
      const deleted = yield* Finance.deletePosition("synced-position").pipe(Effect.flip);
      expect(readOnly.message).toContain("read-only");
      expect(created.message).toContain("read-only");
      expect(quantityUpdate.message).toContain("read-only");
      expect(deleted.message).toContain("read-only");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("captures a new Portfolio snapshot after a successful custodian refresh", () =>
    Effect.gen(function* () {
      yield* Finance.seedSyncedCustodian({
        id: "okx",
        name: "OKX",
        connectorId: "okx",
        credentials: { token: "x" },
      });
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
      const first = yield* Finance.completeCustodianRefresh("okx", {
        refresh: false,
        now: () => new Date("2026-08-11T08:00:00.000Z"),
      });
      const second = yield* Finance.completeCustodianRefresh("okx", {
        refresh: false,
        now: () => new Date("2026-08-11T18:00:00.000Z"),
      });
      const history = yield* Finance.getPortfolioHistory();
      expect(first.custodian.accounts).toHaveLength(1);
      expect(second.failures).toEqual([]);
      expect(history.map(({ capturedAt }) => capturedAt)).toEqual([
        "2026-08-11T08:00:00.000Z",
        "2026-08-11T18:00:00.000Z",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("renames a custodian and refuses to delete one that still has accounts", () =>
    Effect.gen(function* () {
      const bank = yield* Finance.createCustodian({ name: "Old name" });
      yield* Finance.createAccount({
        name: "Checking",
        custodianId: bank.id,
        accountType: "checking",
      });
      const renamed = yield* Finance.updateCustodian(bank.id, { name: "New name" });
      const blocked = yield* Finance.deleteCustodian(bank.id).pipe(Effect.flip);
      expect(renamed.name).toBe("New name");
      expect(blocked.message).toContain("accounts");
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
