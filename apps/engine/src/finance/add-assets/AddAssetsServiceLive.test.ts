import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import { reconcileConnector } from "../connector.js";
import * as Finance from "../finance.test-utils.js";

describe("add assets operations", () => {
  it.effect("creates a stocks holding under a new manual account", () =>
    Effect.gen(function* () {
      const created = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "stocks_etfs",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        account: { type: "new", name: "PEA" },
        quantity: "3",
      });
      const account = yield* Finance.getAccount(created.accountId);
      const accounts = yield* Finance.listManualAccounts();
      expect(created.positionOutcome).toBe("created");
      expect(account.connectionId).toBeNull();
      expect(account.positions[0]?.quantity).toBe("3");
      expect(account.positions[0]?.assetCategory).toBe("stocks_etfs");
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.name).toBe("PEA");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("updates the absolute quantity when the same asset is re-added to one account", () =>
    Effect.gen(function* () {
      const first = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        },
        account: { type: "new", name: "Spot" },
        quantity: "1",
      });
      const second = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        },
        account: { type: "existing", id: first.accountId },
        quantity: "2.5",
      });
      const lookup = yield* Finance.lookupManualHolding(
        first.accountId,
        "coingecko_coin_id",
        "bitcoin",
      );
      const account = yield* Finance.getAccount(first.accountId);
      expect(second.positionOutcome).toBe("updated");
      expect(account.positions).toHaveLength(1);
      expect(account.positions[0]?.quantity).toBe("2.5");
      expect(lookup.quantity).toBe("2.5");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("allows the same asset in several accounts", () =>
    Effect.gen(function* () {
      const first = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "stocks_etfs",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        account: { type: "new", name: "Compte-titres" },
        quantity: "1",
      });
      const second = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "stocks_etfs",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        account: { type: "new", name: "PEA" },
        quantity: "4",
      });
      const firstAccount = yield* Finance.getAccount(first.accountId);
      const secondAccount = yield* Finance.getAccount(second.accountId);
      expect(firstAccount.positions[0]?.assetId).toBe(secondAccount.positions[0]?.assetId);
      expect(firstAccount.positions[0]?.quantity).toBe("1");
      expect(secondAccount.positions[0]?.quantity).toBe("4");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect(
    "creates a cash balance on a chosen or new neutral account, including a negative balance",
    () =>
      Effect.gen(function* () {
        const created = yield* Finance.addCashAccount({
          account: { type: "new", name: "Checking" },
          currencyAssetId: "fiat:EUR",
          balance: "-25",
        });
        const account = yield* Finance.getAccount(created.accountId);
        expect(account.baseCurrencyIso).toBe("EUR");
        expect(account.positions[0]?.assetId).toBe("fiat:EUR");
        expect(account.positions[0]?.assetCategory).toBe("cash");
        expect(account.positions[0]?.quantity).toBe("-25");
      }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("creates an other asset in a user-chosen account", () =>
    Effect.gen(function* () {
      const created = yield* Finance.addOtherAsset({
        name: "Watch",
        value: "1200",
        currencyAssetId: "fiat:USD",
        account: { type: "new", name: "Other assets" },
      });
      const bond = yield* Finance.addOtherAsset({
        category: "bonds",
        name: "US Treasury",
        value: "10000",
        currencyAssetId: "fiat:USD",
        account: { type: "new", name: "Bonds" },
      });
      const dashboard = yield* Finance.getDashboard();
      const pickers = yield* Finance.listManualAccounts();
      const bondAccount = yield* Finance.getAccount(bond.accountId);
      expect(created.accountName).toBe("Other assets");
      expect(dashboard.accounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            accountName: "Other assets",
            connectionId: null,
            total: "1200",
          }),
          expect.objectContaining({
            accountName: "Bonds",
            connectionId: null,
            total: "10000",
          }),
        ]),
      );
      expect(bondAccount.positions[0]?.assetCategory).toBe("bonds");
      expect(pickers.map(({ name }) => name).sort()).toEqual(["Bonds", "Other assets"]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rolls back a failed other-asset write and rejects connected destinations", () =>
    Effect.gen(function* () {
      const before = yield* Finance.listAssets();
      const invalid = yield* Finance.addOtherAsset({
        name: "Broken",
        value: "Infinity",
        currencyAssetId: "fiat:USD",
        account: { type: "new", name: "Stuff" },
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      const after = yield* Finance.listAssets();
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO connections (id, name, connector_id, config_json, created_at, updated_at)
        VALUES ('synced', 'OKX', 'okx', '{}', ${timestamp}, ${timestamp})`;
      yield* sql`INSERT INTO accounts
        (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES ('trading', 'synced', 'Trading', 'fiat:USD', 'trading', ${timestamp}, ${timestamp})`;
      const syncedWrite = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        },
        account: { type: "existing", id: "trading" },
        quantity: "1",
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(invalid).toContain("finite");
      expect(after.length).toBe(before.length);
      expect(syncedWrite).toContain("manual accounts");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("imports mixed asset categories from a connector discovered for one category", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO connections (id, name, connector_id, config_json, created_at, updated_at)
        VALUES ('ibkr', 'IBKR', 'ibkr', '{}', ${timestamp}, ${timestamp})`;
      yield* reconcileConnector("ibkr", {
        complete: true,
        assets: [
          {
            externalAssetId: "ibkr:conid:1",
            assetCategory: "stocks_etfs",
            name: "Apple",
            symbol: "AAPL",
            identifiers: [{ type: "ibkr_conid", value: "1" }],
          },
          {
            externalAssetId: "ibkr:conid:2",
            assetCategory: "crypto",
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
            positions: [
              { externalAssetId: "ibkr:conid:1", quantity: "2" },
              { externalAssetId: "ibkr:conid:2", quantity: "0.5" },
            ],
          },
        ],
      });
      const connection = yield* Finance.getConnection("ibkr");
      const account = yield* Finance.getAccount(connection.accounts[0]!.id);
      expect(account.connectionId).toBe("ibkr");
      expect(account.positions.map(({ assetCategory }) => assetCategory).sort()).toEqual([
        "crypto",
        "stocks_etfs",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
