import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import { reconcileConnector } from "../connector.js";
import * as Finance from "../finance.test-utils.js";

describe("add assets operations", () => {
  it.effect("creates a securities holding under a new manual custodian and account", () =>
    Effect.gen(function* () {
      const created = yield* Finance.addManualHolding({
        asset: {
          assetClass: "security",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        custodian: { type: "new", name: "My broker" },
        account: { type: "new", name: "PEA" },
        quantity: 3,
      });
      const account = yield* Finance.getAccount(created.accountId);
      const custodians = yield* Finance.listManualCustodians();
      expect(created.positionOutcome).toBe("created");
      expect(account.accountKind).toBe("securities");
      expect(account.positions[0]?.quantity).toBe(3);
      expect(custodians).toHaveLength(1);
      expect(custodians[0]?.name).toBe("My broker");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("updates the absolute quantity when the same asset is re-added to one account", () =>
    Effect.gen(function* () {
      const first = yield* Finance.addManualHolding({
        asset: {
          assetClass: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        },
        custodian: { type: "new", name: "Wallet" },
        account: { type: "new", name: "Spot" },
        quantity: 1,
      });
      const second = yield* Finance.addManualHolding({
        asset: {
          assetClass: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        },
        custodian: { type: "existing", id: first.custodianId },
        account: { type: "existing", id: first.accountId },
        quantity: 2.5,
      });
      const lookup = yield* Finance.lookupManualHolding(
        first.accountId,
        "coingecko_coin_id",
        "bitcoin",
      );
      const account = yield* Finance.getAccount(first.accountId);
      expect(second.positionOutcome).toBe("updated");
      expect(account.positions).toHaveLength(1);
      expect(account.positions[0]?.quantity).toBe(2.5);
      expect(lookup.quantity).toBe(2.5);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("allows the same security in several accounts and duplicate custodian names", () =>
    Effect.gen(function* () {
      const first = yield* Finance.addManualHolding({
        asset: {
          assetClass: "security",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        custodian: { type: "new", name: "Broker" },
        account: { type: "new", name: "Compte-titres" },
        quantity: 1,
      });
      const second = yield* Finance.addManualHolding({
        asset: {
          assetClass: "security",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        custodian: { type: "new", name: "Broker" },
        account: { type: "new", name: "PEA" },
        quantity: 4,
      });
      const firstAccount = yield* Finance.getAccount(first.accountId);
      const secondAccount = yield* Finance.getAccount(second.accountId);
      const custodians = yield* Finance.listCustodians();
      expect(firstAccount.positions[0]?.assetId).toBe(secondAccount.positions[0]?.assetId);
      expect(firstAccount.positions[0]?.quantity).toBe(1);
      expect(secondAccount.positions[0]?.quantity).toBe(4);
      expect(custodians.map(({ name }) => name)).toEqual(["Broker", "Broker"]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect(
    "creates a current account and fiat balance atomically, including a negative balance",
    () =>
      Effect.gen(function* () {
        const created = yield* Finance.addCashAccount({
          accountKind: "current",
          custodian: { type: "new", name: "Bank" },
          accountName: "Checking",
          currencyAssetId: "fiat:EUR",
          balance: -25,
        });
        const account = yield* Finance.getAccount(created.accountId);
        expect(account.accountKind).toBe("current");
        expect(account.baseCurrencyIso).toBe("EUR");
        expect(account.positions[0]?.assetId).toBe("fiat:EUR");
        expect(account.positions[0]?.quantity).toBe(-25);
      }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("creates an other asset without exposing system records in pickers", () =>
    Effect.gen(function* () {
      const created = yield* Finance.addOtherAsset({
        name: "Watch",
        value: 1200,
        currencyAssetId: "fiat:USD",
      });
      const dashboard = yield* Finance.getDashboard();
      const pickers = yield* Finance.listManualCustodians();
      const listed = yield* Finance.listCustodians();
      const rename = yield* Finance.updateCustodian(created.custodianId, { name: "Changed" }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      const remove = yield* Finance.deleteCustodian(created.custodianId).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(created.accountName).toBe("Other assets");
      expect(dashboard.accounts).toEqual([
        expect.objectContaining({
          accountName: "Other assets",
          custodianName: "",
          presentationRole: "direct_ownership",
          total: 1200,
        }),
      ]);
      expect(pickers).toEqual([]);
      expect(listed).toEqual([]);
      expect(rename).toContain("System-managed");
      expect(remove).toContain("System-managed");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rolls back a failed other-asset write and rejects synced destinations", () =>
    Effect.gen(function* () {
      const before = yield* Finance.listAssets();
      const invalid = yield* Finance.addOtherAsset({
        name: "Broken",
        value: Number.POSITIVE_INFINITY,
        currencyAssetId: "fiat:USD",
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      const after = yield* Finance.listAssets();
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
        VALUES ('synced', 'OKX', 'synced', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO custodian_connectors
        (custodian_id, connector_id, config_json, created_at, updated_at)
        VALUES ('synced', 'okx', '{}', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO accounts
        (id, custodian_id, name, account_kind, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('trading', 'synced', 'Trading', 'crypto', 'fiat:USD', 'trading', ${timestamp}, ${timestamp})`;
      const syncedWrite = yield* Finance.addManualHolding({
        asset: {
          assetClass: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        },
        custodian: { type: "existing", id: "synced" },
        account: { type: "existing", id: "trading" },
        quantity: 1,
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(invalid).toContain("finite");
      expect(after.length).toBe(before.length);
      expect(syncedWrite).toContain("read-only");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("imports mixed asset classes from a connector discovered for one class", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
        VALUES ('ibkr', 'IBKR', 'synced', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO custodian_connectors
        (custodian_id, connector_id, config_json, created_at, updated_at)
        VALUES ('ibkr', 'ibkr', '{}', ${timestamp}, ${timestamp})`;
      yield* reconcileConnector("ibkr", {
        complete: true,
        assets: [
          {
            externalAssetId: "ibkr:conid:1",
            assetClass: "security",
            name: "Apple",
            symbol: "AAPL",
            identifiers: [{ type: "ibkr_conid", value: "1" }],
          },
          {
            externalAssetId: "ibkr:conid:2",
            assetClass: "crypto",
            name: "Bitcoin",
            symbol: "BTC",
            identifiers: [{ type: "ibkr_conid", value: "2" }],
          },
        ],
        accounts: [
          {
            externalAccountId: "U1",
            name: "Portfolio",
            baseCurrencyIso: "USD",
            accountKind: "securities",
            positions: [
              { externalAssetId: "ibkr:conid:1", quantity: 2 },
              { externalAssetId: "ibkr:conid:2", quantity: 0.5 },
            ],
          },
        ],
      });
      const custodian = yield* Finance.getCustodian("ibkr");
      const account = yield* Finance.getAccount(custodian.accounts[0]!.id);
      expect(account.accountKind).toBe("securities");
      expect(account.positions.map(({ assetClass }) => assetClass).sort()).toEqual([
        "crypto",
        "security",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
