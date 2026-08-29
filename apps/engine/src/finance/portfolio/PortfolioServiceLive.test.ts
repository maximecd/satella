import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

const quoteUsd = (
  sql: SqlClient.SqlClient,
  assetId: string,
  price: string,
  at = "2026-08-11T00:00:00.000Z",
) =>
  sql`INSERT INTO asset_prices (asset_id, price, currency_asset_id, source, observed_at, updated_at)
    VALUES (${assetId}, ${price}, 'fiat:USD', 'test', ${at}, ${at})
    ON CONFLICT(asset_id) DO UPDATE SET price = excluded.price,
      currency_asset_id = excluded.currency_asset_id, source = excluded.source,
      observed_at = excluded.observed_at, updated_at = excluded.updated_at`;

describe("portfolio snapshots", () => {
  it.effect("captures current quantities and selected prices atomically", () =>
    Effect.gen(function* () {
      const account = yield* Finance.createAccount({
        name: "Default",
      });
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Art",
        identifiers: [],
      });
      yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: "1" });
      yield* Finance.setManualPrice(asset.id, { price: "500", currencyAssetId: "fiat:USD" });
      const snapshot = yield* Finance.captureSnapshot({ refresh: false });
      const history = yield* Finance.getPortfolioHistory();
      expect(snapshot.positionCount).toBe(1);
      expect(snapshot.priceCount).toBe(1);
      expect(Date.parse(snapshot.capturedAt)).not.toBeNaN();
      expect(history).toEqual([expect.objectContaining({ total: "500", totalIncomplete: false })]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("keeps a snapshot from every refresh, even several in quick succession", () =>
    Effect.gen(function* () {
      const first = yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T00:00:00.000Z"),
      });
      const second = yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T01:00:00.000Z"),
      });
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      const history = yield* Finance.getPortfolioHistory();
      expect(history.map(({ capturedAt }) => capturedAt)).toEqual([
        "2026-08-11T00:00:00.000Z",
        "2026-08-11T01:00:00.000Z",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("keeps every snapshot, including several on the same calendar day", () =>
    Effect.gen(function* () {
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T00:00:00.000Z"),
      });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T12:00:00.000Z"),
      });
      const history = yield* Finance.getPortfolioHistory();
      expect(history.map(({ capturedAt }) => capturedAt)).toEqual([
        "2026-08-11T00:00:00.000Z",
        "2026-08-11T12:00:00.000Z",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("captures FX for supported Reporting currencies even when they are not held", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* quoteUsd(sql, "fiat:EUR", "1.1");
      const account = yield* Finance.createAccount({ name: "Cash" });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: "fiat:USD",
        quantity: "110",
      });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T00:00:00.000Z"),
      });
      yield* Finance.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
      const history = yield* Finance.getPortfolioHistory();
      expect(history).toEqual([
        expect.objectContaining({ capturedAt: "2026-08-11T00:00:00.000Z", total: "100" }),
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});

describe("portfolio dashboard", () => {
  it.effect("values the dashboard in Reporting currency without mutating Account totals", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* quoteUsd(sql, "fiat:EUR", "1.1");
      const brokerage = yield* Finance.createAccount({ name: "Brokerage" });
      const livret = yield* Finance.createAccount({
        name: "Livret A",
        baseCurrencyAssetId: "fiat:EUR",
      });
      const art = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Art",
        identifiers: [],
      });
      yield* Finance.createPosition({ accountId: brokerage.id, assetId: art.id, quantity: "2" });
      yield* Finance.setManualPrice(art.id, { price: "500", currencyAssetId: "fiat:USD" });
      yield* Finance.createPosition({
        accountId: livret.id,
        assetId: "fiat:EUR",
        quantity: "100",
      });
      const usdGroups = yield* Finance.listAccountGroups();
      const usdDashboard = yield* Finance.getDashboard();
      const nativeLivret = yield* Finance.getAccount(livret.id);
      yield* Finance.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
      const eurDashboard = yield* Finance.getDashboard();
      const nativeAfter = yield* Finance.getAccount(livret.id);

      const dashboardAccounts = usdGroups.flatMap((group) => group.accounts);
      expect(usdDashboard.reportingCurrency.iso).toBe("USD");
      expect(usdDashboard.totalAssets).toBe("1110");
      expect(usdDashboard.totalDebt).toBe("0");
      expect(usdDashboard.netWorth).toBe("1110");
      expect(dashboardAccounts[0]?.accountName).toBe("Brokerage");
      expect(dashboardAccounts[0]?.total).toBe("1000");
      expect(dashboardAccounts[1]?.accountName).toBe("Livret A");
      expect(dashboardAccounts[1]?.total).toBe("110");
      expect(nativeLivret.total).toBe("100");
      expect(nativeLivret.baseCurrencyIso).toBe("EUR");
      expect(eurDashboard.reportingCurrency.iso).toBe("EUR");
      expect(eurDashboard.totalAssets).toBe("1009.0909090909090909090909090909090909090909090909");
      expect(nativeAfter.total).toBe("100");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("aggregates allocation, omits zero, and discloses unpriced and negative holdings", () =>
    Effect.gen(function* () {
      const growth = yield* Finance.createAccount({ name: "Growth" });
      const trading = yield* Finance.createAccount({ name: "Trading" });
      const apple = yield* Finance.createAsset({
        assetCategory: "stocks_etfs",
        name: "Apple",
        symbol: "AAPL",
        identifiers: [{ type: "isin", value: "US0378331005" }],
      });
      const bitcoin = yield* Finance.createAsset({
        assetCategory: "crypto",
        name: "Bitcoin",
        symbol: "BTC",
        identifiers: [],
      });
      const watch = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Watch",
        identifiers: [],
      });
      const short = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Short",
        identifiers: [],
      });
      yield* Finance.createPosition({ accountId: growth.id, assetId: apple.id, quantity: "2" });
      yield* Finance.createPosition({ accountId: trading.id, assetId: apple.id, quantity: "3" });
      yield* Finance.createPosition({ accountId: growth.id, assetId: bitcoin.id, quantity: "1" });
      yield* Finance.createPosition({ accountId: growth.id, assetId: watch.id, quantity: "0" });
      yield* Finance.createPosition({ accountId: trading.id, assetId: short.id, quantity: "-1" });
      const sql = yield* SqlClient.SqlClient;
      yield* quoteUsd(sql, apple.id, "10");
      yield* Finance.setManualPrice(short.id, { price: "4", currencyAssetId: "fiat:USD" });
      const dashboard = yield* Finance.getDashboard();

      expect(dashboard.totalAssets).toBe("46");
      expect(dashboard.hasMeaningfulAssets).toBe(true);
      expect(dashboard.unpricedAssetCount).toBe(1);
      expect(dashboard.negativeHoldingCount).toBe(1);
      expect(dashboard.totalIncomplete).toBe(true);
      expect(dashboard.assetAllocation).toEqual([
        expect.objectContaining({
          key: apple.id,
          name: "Apple",
          symbol: "AAPL",
          value: "50",
          percent: "100",
        }),
      ]);
      expect(dashboard.categoryAllocation).toEqual([
        expect.objectContaining({
          key: "stocks_etfs",
          name: "Stocks & ETFs",
          value: "50",
          percent: "100",
        }),
      ]);
      const groups = yield* Finance.listAccountGroups();
      expect(
        groups
          .flatMap((group) => group.accounts)
          .map(({ accountName }) => accountName)
          .sort(),
      ).toEqual(["Growth", "Trading"]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect(
    "recomputes history in the active Reporting currency without filling missing days",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* quoteUsd(sql, "fiat:EUR", "1.1");
        const account = yield* Finance.createAccount({ name: "Cash" });
        yield* Finance.createPosition({
          accountId: account.id,
          assetId: "fiat:USD",
          quantity: "110",
        });
        yield* Finance.captureSnapshot({
          refresh: false,
          now: () => new Date("2026-08-01T00:00:00.000Z"),
        });
        yield* Finance.updatePosition(
          (yield* Finance.getAccount(account.id)).positions[0]!.id,
          "220",
        );
        yield* Finance.captureSnapshot({
          refresh: false,
          now: () => new Date("2026-08-03T00:00:00.000Z"),
        });
        yield* Finance.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
        const history = yield* Finance.getPortfolioHistory();
        const dashboard = yield* Finance.getDashboard();

        expect(history.map(({ capturedAt, total }) => [capturedAt, total])).toEqual([
          ["2026-08-01T00:00:00.000Z", "100"],
          ["2026-08-03T00:00:00.000Z", "200"],
        ]);
        expect(dashboard.history).toHaveLength(2);
      }).pipe(Effect.provide(engineTestLayer())),
  );
});

describe("portfolio debts", () => {
  it.effect("records the debt total in Reporting currency on every snapshot", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* quoteUsd(sql, "fiat:EUR", "1.1");
      yield* Finance.createDebt({
        name: "Income tax",
        kind: "tax",
        amount: "4000",
        currencyAssetId: "fiat:EUR",
      });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T00:00:00.000Z"),
      });
      const history = yield* Finance.getPortfolioHistory();
      expect(history).toEqual([
        expect.objectContaining({
          capturedAt: "2026-08-11T00:00:00.000Z",
          total: "0",
          totalDebt: "4400",
        }),
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("keeps each history point at the debt total captured that day", () =>
    Effect.gen(function* () {
      const debt = yield* Finance.createDebt({
        name: "Consumer loan",
        kind: "loan",
        amount: "1000",
        currencyAssetId: "fiat:USD",
      });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-01T00:00:00.000Z"),
      });
      yield* Finance.updateDebt(debt.id, { amount: "400" });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-02T00:00:00.000Z"),
      });
      const history = yield* Finance.getPortfolioHistory();
      expect(history.map(({ totalDebt }) => totalDebt)).toEqual(["1000", "400"]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("reports today's debt live and net worth as assets minus debts", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* quoteUsd(sql, "fiat:EUR", "1.1");
      const account = yield* Finance.createAccount({ name: "Cash" });
      yield* Finance.createPosition({
        accountId: account.id,
        assetId: "fiat:USD",
        quantity: "500",
      });
      const debt = yield* Finance.createDebt({
        name: "Income tax",
        kind: "tax",
        amount: "2000",
        currencyAssetId: "fiat:EUR",
      });
      const dashboard = yield* Finance.getDashboard();
      expect(dashboard.totalAssets).toBe("500");
      expect(dashboard.totalDebt).toBe("2200");
      expect(dashboard.netWorth).toBe("-1700");
      expect(dashboard.totalIncomplete).toBe(false);
      yield* Finance.deleteDebt(debt.id);
      const clean = yield* Finance.getDashboard();
      expect(clean.totalDebt).toBe("0");
      expect(clean.netWorth).toBe(clean.totalAssets);
      expect(clean.totalIncomplete).toBe(false);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("flags the dashboard incomplete when a debt currency has no exchange rate", () =>
    Effect.gen(function* () {
      yield* Finance.createDebt({
        name: "Income tax",
        kind: "tax",
        amount: "100",
        currencyAssetId: "fiat:EUR",
      });
      const dashboard = yield* Finance.getDashboard();
      expect(dashboard.totalDebt).toBe("0");
      expect(dashboard.totalIncomplete).toBe(true);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
