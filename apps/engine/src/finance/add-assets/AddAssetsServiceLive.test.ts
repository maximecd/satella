import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { reconcileConnector } from "../connector.js";
import * as Finance from "../finance.test-utils.js";
import type { MarketDataProvider, MarketDataRegistry } from "../market-data.js";
import { addManualHolding } from "./AddAssetsSql.js";

describe("add assets operations", () => {
  it.effect("fetches a selected market-data asset before returning the holding", () =>
    Effect.gen(function* () {
      const yahoo: MarketDataProvider = {
        id: "yahoo-finance",
        chunkSize: 50,
        fetchPrices: (lookups) =>
          Effect.succeed({
            observations: lookups.map(({ lookupKey }) => ({
              lookupKey,
              price: "420",
              currencyIso: "USD",
              observedAt: new Date("2026-08-23T10:00:00.000Z"),
            })),
            failures: [],
          }),
      };
      const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);
      const created = yield* addManualHolding(
        {
          asset: {
            assetCategory: "stocks_etfs",
            name: "SpaceX",
            symbol: "SPACEX",
            identifiers: [{ type: "yahoo_symbol", value: "SPACEX" }],
          },
          custodian: { type: "new", name: "Broker" },
          account: { type: "new", name: "Portfolio", accountType: "brokerage" },
          quantity: "1",
        },
        { registry },
      );

      const account = yield* Finance.getAccount(created.accountId);
      expect(account.totalIncomplete).toBe(false);
      expect(account.positions[0]?.reportingValue).toBe("420");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("adds a checking account under a new bank with a starting balance", () =>
    Effect.gen(function* () {
      const created = yield* Finance.addCashAccount({
        accountType: "checking",
        custodian: { type: "new", name: "BNP Paribas" },
        name: "Compte courant",
        currencyAssetId: "fiat:USD",
        balance: "1200",
      });
      const account = yield* Finance.getAccount(created.accountId);
      expect(created.positionOutcome).toBe("created");
      expect(account.accountType).toBe("checking");
      expect(account.custodianName).toBe("BNP Paribas");
      expect(account.isDefaultCustodian).toBe(false);
      expect(account.baseCurrencyIso).toBe("USD");
      expect(account.positions[0]?.quantity).toBe("1200");
      expect(yield* Finance.listAccountGroups()).toEqual([
        expect.objectContaining({
          name: "BNP Paribas",
          isDefault: false,
          accounts: [
            expect.objectContaining({
              accountName: "Compte courant",
              total: "1200",
            }),
          ],
        }),
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("groups several savings accounts under the same bank", () =>
    Effect.gen(function* () {
      const livret = yield* Finance.addCashAccount({
        accountType: "savings",
        custodian: { type: "new", name: "BNP Paribas" },
        name: "Livret A",
        currencyAssetId: "fiat:EUR",
        balance: "1200",
      });
      const lep = yield* Finance.addCashAccount({
        accountType: "savings",
        custodian: {
          type: "existing",
          id: (yield* Finance.getAccount(livret.accountId)).custodianId,
        },
        name: "LEP",
        currencyAssetId: "fiat:EUR",
        balance: "100",
      });
      expect(lep.accountName).toBe("LEP");
      expect(yield* Finance.listAccountGroups()).toHaveLength(1);
      expect(
        (yield* Finance.listAccountGroups())[0]?.accounts
          .map(({ accountName }) => accountName)
          .sort(),
      ).toEqual(["LEP", "Livret A"]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("rejects a stock in a checking account and a second currency in savings", () =>
    Effect.gen(function* () {
      const checking = yield* Finance.addCashAccount({
        accountType: "checking",
        custodian: { type: "new", name: "BNP Paribas" },
        name: "Compte courant",
        currencyAssetId: "fiat:EUR",
        balance: "10",
      });
      const savings = yield* Finance.addCashAccount({
        accountType: "savings",
        custodian: {
          type: "existing",
          id: (yield* Finance.getAccount(checking.accountId)).custodianId,
        },
        name: "Livret A",
        currencyAssetId: "fiat:EUR",
        balance: "10",
      });
      const apple = yield* Finance.createAsset({
        assetCategory: "stocks_etfs",
        name: "Apple",
        identifiers: [{ type: "isin", value: "US0378331005" }],
      });
      const holdingOnCash = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "stocks_etfs",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        custodian: {
          type: "existing",
          id: (yield* Finance.getAccount(checking.accountId)).custodianId,
        },
        account: { type: "existing", id: checking.accountId },
        quantity: "1",
      }).pipe(Effect.flip);
      const stockOnChecking = yield* Finance.createPosition({
        accountId: checking.accountId,
        assetId: apple.id,
        quantity: "1",
      }).pipe(Effect.flip);
      const secondCurrency = yield* Finance.createPosition({
        accountId: savings.accountId,
        assetId: "fiat:USD",
        quantity: "5",
      }).pipe(Effect.flip);
      expect(holdingOnCash.message).toContain("right type");
      expect(stockOnChecking.message).toContain("can only hold cash");
      expect(secondCurrency.message).toContain("exactly one currency");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("creates a stocks holding under a named broker and brokerage account", () =>
    Effect.gen(function* () {
      const created = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "stocks_etfs",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        },
        custodian: { type: "new", name: "Boursorama" },
        account: { type: "new", name: "PEA", accountType: "brokerage" },
        quantity: "3",
      });
      const account = yield* Finance.getAccount(created.accountId);
      expect(account.accountType).toBe("brokerage");
      expect(account.custodianName).toBe("Boursorama");
      expect(account.positions[0]?.quantity).toBe("3");
      expect(account.positions[0]?.assetCategory).toBe("stocks_etfs");
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
        custodian: { type: "new", name: "OKX" },
        account: { type: "new", name: "Spot", accountType: "crypto_wallet" },
        quantity: "1",
      });
      const second = yield* Finance.addManualHolding({
        asset: {
          assetCategory: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        },
        custodian: {
          type: "existing",
          id: (yield* Finance.getAccount(first.accountId)).custodianId,
        },
        account: { type: "existing", id: first.accountId },
        quantity: "2.5",
      });
      const lookup = yield* Finance.lookupManualHolding(
        first.accountId,
        "coingecko_coin_id",
        "bitcoin",
      );
      expect(second.positionOutcome).toBe("updated");
      expect(lookup.quantity).toBe("2.5");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("places other assets on the default manual account", () =>
    Effect.gen(function* () {
      const created = yield* Finance.addOtherAsset({
        name: "Watch",
        value: "1200",
        currencyAssetId: "fiat:USD",
      });
      const account = yield* Finance.getAccount(created.accountId);
      const dashboard = yield* Finance.getDashboard();
      const pickers = yield* Finance.listManualAccounts();
      expect(account.isDefaultCustodian).toBe(true);
      expect(account.name).toBe("Manual account");
      expect(account.accountType).toBe("other");
      expect(dashboard.totalAssets).toBe("1200");
      expect(yield* Finance.listAccountGroups()).toEqual([
        expect.objectContaining({
          isDefault: true,
          name: "Manual custodian",
          accounts: [expect.objectContaining({ accountName: "Manual account", total: "1200" })],
        }),
      ]);
      expect(pickers).toEqual([]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect(
    "rejects manual holdings on synced custodians and rolls back a failed other-asset write",
    () =>
      Effect.gen(function* () {
        const before = yield* Finance.listAssets();
        const invalid = yield* Finance.addOtherAsset({
          name: "Broken",
          value: "Infinity",
          currencyAssetId: "fiat:USD",
        }).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        const after = yield* Finance.listAssets();
        yield* Finance.seedSyncedCustodian({
          id: "synced",
          name: "OKX",
          connectorId: "okx",
          accounts: [
            {
              id: "trading",
              name: "Trading",
              connectorAccountId: "trading",
              accountType: "crypto_wallet",
            },
          ],
        });
        const syncedWrite = yield* Finance.addManualHolding({
          asset: {
            assetCategory: "crypto",
            name: "Bitcoin",
            symbol: "BTC",
            identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
          },
          custodian: { type: "existing", id: "synced" },
          account: { type: "existing", id: "trading" },
          quantity: "1",
        }).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        expect(invalid).toContain("finite");
        expect(after.length).toBe(before.length);
        expect(syncedWrite).toContain("manual");
      }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("imports mixed asset categories onto a synced custodian", () =>
    Effect.gen(function* () {
      yield* Finance.seedSyncedCustodian({
        id: "ibkr",
        name: "IBKR",
        connectorId: "ibkr",
      });
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
      const custodian = yield* Finance.getCustodian("ibkr");
      const account = yield* Finance.getAccount(custodian.accounts[0]!.id);
      expect(account.custodianId).toBe("ibkr");
      expect(account.accountType).toBe("brokerage");
      expect(account.positions.map(({ assetCategory }) => assetCategory).sort()).toEqual([
        "crypto",
        "stocks_etfs",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("every account belongs to a custodian including the seeded default", () =>
    Effect.gen(function* () {
      const custodians = yield* Finance.listCustodians();
      const defaults = custodians.filter((custodian) => custodian.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]?.name).toBe("Manual custodian");
      expect(defaults[0]?.accounts).toEqual([
        expect.objectContaining({ name: "Manual account", accountType: "other" }),
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
