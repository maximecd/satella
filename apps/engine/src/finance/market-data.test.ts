import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { encryptedDatabaseLayer } from "../database/database.test-utils.js";
import type { MarketDataProvider, MarketDataRegistry, ProviderLookup } from "./market-data.js";
import { refreshPrices } from "./market-data.js";
import * as Finance from "./finance.test-utils.js";

const directories: string[] = [];
const run = async <A>(program: Effect.Effect<A, unknown, SqlClient.SqlClient>) => {
  const directory = await mkdtemp(join(tmpdir(), "optimus-market-data-"));
  directories.push(directory);
  return Effect.runPromise(
    Effect.scoped(
      program.pipe(
        Effect.provide(encryptedDatabaseLayer(directory)),
      ),
    ),
  );
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("market data coordinator", () => {
  it("reuses a reviewed provider lookup from an existing asset with the same symbol", async () => {
    const batches: Array<ReadonlyArray<ProviderLookup>> = [];
    const coingecko: MarketDataProvider = {
      id: "coingecko",
      chunkSize: 500,
      fetchPrices: (lookups) => {
        batches.push(lookups);
        return Effect.succeed({
          observations: lookups.map(({ lookupKey }) => ({
            lookupKey,
            price: 64_021,
            currencyIso: "USD",
            observedAt: new Date(),
          })),
          failures: [],
        });
      },
    };
    const registry: MarketDataRegistry = new Map([["coingecko", coingecko]]);

    const result = await run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const canonical = yield* Finance.createAsset({
          assetCategory: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
        });
        const duplicate = yield* Finance.createAsset({
          assetCategory: "crypto",
          name: "BTC",
          symbol: "BTC",
          identifiers: [],
        });
        const timestamp = new Date().toISOString();
        yield* sql`INSERT INTO connections (id, name, connector_id, config_json, created_at, updated_at)
          VALUES ('okx', 'OKX', 'okx', '{}', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO accounts
          (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
          VALUES ('trading', 'okx', 'Trading', 'fiat:USD', 'trading', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
          VALUES ('btc-position', 'trading', ${duplicate.id}, 1, ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO connector_asset_mappings (connection_id, external_asset_id, asset_id)
          VALUES ('okx', 'okx:currency:BTC', ${duplicate.id})`;
        const refreshed = yield* refreshPrices({ registry, requireFresh: true });
        return {
          canonical,
          duplicate,
          refreshed,
          assets: yield* Finance.listAssets(),
          valued: yield* Finance.getAccount("trading"),
        };
      }),
    );

    expect(batches[0]?.map(({ lookupKey }) => lookupKey)).toEqual(["bitcoin"]);
    expect(result.refreshed.refreshedAssetIds).toEqual([result.canonical.id]);
    expect(result.assets.some(({ id }) => id === result.duplicate.id)).toBe(false);
    expect(result.valued.positions[0]?.assetId).toBe(result.canonical.id);
    expect(result.valued.totalIncomplete).toBe(false);
  });

  it("discovers a provider lookup for an unlinked connector asset", async () => {
    const batches: Array<ReadonlyArray<ProviderLookup>> = [];
    const coingecko: MarketDataProvider = {
      id: "coingecko",
      chunkSize: 500,
      fetchPrices: (lookups) => {
        batches.push(lookups);
        return Effect.succeed({
          observations: lookups.map(({ lookupKey }) => ({
            lookupKey,
            price: 64_021,
            currencyIso: "USD",
            observedAt: new Date(),
          })),
          failures: [],
        });
      },
    };
    const registry: MarketDataRegistry = new Map([["coingecko", coingecko]]);

    const result = await run(
      Effect.gen(function* () {
        const bitcoin = yield* Finance.createAsset({
          assetCategory: "crypto",
          name: "BTC",
          symbol: "BTC",
          identifiers: [],
        });
        const account = yield* Finance.createAccount({
          name: "Trading",
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: bitcoin.id, quantity: 1 });
        const refreshed = yield* refreshPrices({
          registry,
          requireFresh: true,
          searchAssets: () =>
            Effect.succeed([
              {
                provider: "coingecko" as const,
                assetCategory: "crypto" as const,
                name: "Bitcoin",
                symbol: "BTC",
                identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
              },
            ]),
        });
        const valued = yield* Finance.getAccount(account.id);
        return { bitcoin, refreshed, valued };
      }),
    );

    expect(batches[0]?.map(({ lookupKey }) => lookupKey)).toEqual(["bitcoin"]);
    expect(result.refreshed.refreshedAssetIds).toEqual([result.bitcoin.id]);
    expect(result.valued.total).toBe(64_021);
    expect(result.valued.totalIncomplete).toBe(false);
  });

  it("fetches a missing quote currency in the same refresh and values the position", async () => {
    const batches: Array<ReadonlyArray<ProviderLookup>> = [];
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: (lookups) => {
        batches.push(lookups);
        return Effect.succeed({
          observations: lookups.map(({ lookupKey, kind }) => ({
            lookupKey,
            price: kind === "fiat" ? 1.1 : 34,
            currencyIso: kind === "fiat" ? "USD" : "EUR",
            observedAt: new Date(),
          })),
          failures: [],
        });
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);

    const result = await run(
      Effect.gen(function* () {
        const etf = yield* Finance.createAsset({
          assetCategory: "stocks_etfs",
          name: "EUR ETF",
          identifiers: [{ type: "yahoo_symbol", value: "ETF.PA" }],
        });
        const account = yield* Finance.createAccount({
          name: "Portfolio",
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: etf.id, quantity: 2 });
        const refreshed = yield* refreshPrices({ registry, requireFresh: true });
        const valued = yield* Finance.getAccount(account.id);
        return { etf, refreshed, valued };
      }),
    );

    expect(batches.map((batch) => batch.map(({ lookupKey }) => lookupKey))).toEqual([
      ["ETF.PA"],
      ["EURUSD=X"],
    ]);
    expect(result.refreshed.refreshedAssetIds).toEqual([result.etf.id, "fiat:EUR"]);
    expect(result.valued.positions[0]?.reportingValue).toBeCloseTo(74.8);
    expect(result.valued.totalIncomplete).toBe(false);
  });

  it("resolves an imported security by ISIN before trusting its bare ticker", async () => {
    const searches: string[] = [];
    const batches: Array<ReadonlyArray<ProviderLookup>> = [];
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: (lookups) => {
        batches.push(lookups);
        return Effect.succeed({
          observations: lookups.map(({ lookupKey, kind }) => ({
            lookupKey,
            price: kind === "fiat" ? 1.1 : 301,
            currencyIso: kind === "fiat" ? "USD" : "EUR",
            observedAt: new Date(),
          })),
          failures: [],
        });
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);
    const isin = "FR0011550185";

    const result = await run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const etf = yield* Finance.createAsset({
          assetCategory: "stocks_etfs",
          name: "BNP EASY S&P 500 EUR",
          symbol: "ESE",
          identifiers: [{ type: "isin", value: isin }],
        });
        // This is the stale mapping produced by the old ticker-first flow.
        yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
          VALUES ('stale-yahoo', ${etf.id}, 'yahoo_symbol', 'ESE')`;
        const account = yield* Finance.createAccount({
          name: "Portfolio",
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: etf.id, quantity: 1 });
        const refreshed = yield* refreshPrices({
          registry,
          requireFresh: true,
          searchAssets: (query) => {
            searches.push(query);
            return Effect.succeed([
              {
                provider: "yahoo-finance" as const,
                assetCategory: "stocks_etfs" as const,
                name: "BNP Paribas Easy S&P 500 UCITS ETF",
                symbol: "ESE.PA",
                identifiers: [{ type: "yahoo_symbol", value: "ESE.PA" }],
              },
            ]);
          },
        });
        return {
          refreshed,
          asset: yield* Finance.getAsset(etf.id),
          account: yield* Finance.getAccount(account.id),
        };
      }),
    );

    expect(searches).toEqual([isin]);
    expect(batches[0]?.map(({ lookupKey }) => lookupKey)).toEqual(["ESE.PA"]);
    expect(result.asset.identifiers).toEqual([
      { type: "isin", value: isin },
      { type: "yahoo_symbol", value: "ESE.PA" },
    ]);
    expect(result.account.totalIncomplete).toBe(false);
    expect(result.refreshed.refreshedAssetIds).toContain(result.asset.id);
  });

  it("deduplicates provider lookups, persists partial success, and reuses fresh observations", async () => {
    const batches: Array<ReadonlyArray<ProviderLookup>> = [];
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: (lookups) => {
        batches.push(lookups);
        return Effect.succeed({
          observations: lookups
            .filter(({ lookupKey }) => lookupKey === "AAPL")
            .map(({ lookupKey }) => ({
              lookupKey,
              price: 200,
              currencyIso: "USD",
              observedAt: new Date(),
            })),
          failures: lookups
            .filter(({ lookupKey }) => lookupKey !== "AAPL")
            .map(({ lookupKey }) => ({
              lookupKey,
              category: "not-found" as const,
              message: "Unknown symbol",
            })),
        });
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);

    const result = await run(
      Effect.gen(function* () {
        const apple = yield* Finance.createAsset({
          assetCategory: "stocks_etfs",
          name: "Apple",
          identifiers: [{ type: "yahoo_symbol", value: "AAPL" }],
        });
        const unknown = yield* Finance.createAsset({
          assetCategory: "stocks_etfs",
          name: "Unknown",
          identifiers: [{ type: "yahoo_symbol", value: "UNKNOWN" }],
        });
        const first = yield* Finance.createAccount({
          name: "Default",
        });
        const second = yield* Finance.createAccount({
          name: "Default",
        });
        yield* Finance.createPosition({ accountId: first.id, assetId: apple.id, quantity: 1 });
        yield* Finance.createPosition({ accountId: second.id, assetId: apple.id, quantity: 2 });
        yield* Finance.createPosition({ accountId: first.id, assetId: unknown.id, quantity: 1 });
        const refreshed = yield* refreshPrices({ registry, requireFresh: true });
        const valued = yield* Finance.getAccount(second.id);
        const freshPass = yield* refreshPrices({ registry });
        return { apple, unknown, refreshed, valued, freshPass };
      }),
    );

    expect(batches[0]?.map(({ lookupKey }) => lookupKey).sort()).toEqual(["AAPL", "UNKNOWN"]);
    expect(batches[0]?.find(({ lookupKey }) => lookupKey === "AAPL")?.assetIds).toHaveLength(1);
    expect(result.refreshed.refreshedAssetIds).toEqual([result.apple.id]);
    expect(result.refreshed.failures).toEqual([
      expect.objectContaining({ assetId: result.unknown.id, category: "not-found" }),
    ]);
    expect(result.valued.total).toBe(400);
    expect(result.freshPass.refreshedAssetIds).toEqual([]);
    expect(batches).toHaveLength(2);
    expect(batches[1]?.map(({ lookupKey }) => lookupKey)).toEqual(["UNKNOWN"]);
  });

  it("never sends other assets to a provider", async () => {
    let requests = 0;
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: () => {
        requests += 1;
        return Effect.succeed({ observations: [], failures: [] });
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);
    const result = await run(
      Effect.gen(function* () {
        const custom = yield* Finance.createAsset({
          assetCategory: "other",
          name: "Art",
          identifiers: [],
        });
        const account = yield* Finance.createAccount({
          name: "Default",
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: custom.id, quantity: 1 });
        return yield* refreshPrices({ registry, requireFresh: true });
      }),
    );
    expect(result.refreshedAssetIds).toEqual([]);
    expect(requests).toBe(0);
  });

  it("coalesces simultaneous refreshes for the same provider lookup", async () => {
    let requests = 0;
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: (lookups) => {
        requests += 1;
        return Effect.sleep("20 millis").pipe(
          Effect.as({
            observations: lookups.map(({ lookupKey }) => ({
              lookupKey,
              price: 100,
              currencyIso: "USD",
              observedAt: new Date(),
            })),
            failures: [],
          }),
        );
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);
    await run(
      Effect.gen(function* () {
        const asset = yield* Finance.createAsset({
          assetCategory: "stocks_etfs",
          name: "Shared",
          identifiers: [{ type: "yahoo_symbol", value: "SHARED" }],
        });
        const account = yield* Finance.createAccount({
          name: "Default",
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: 1 });
        yield* Effect.all(
          [
            refreshPrices({ registry, requireFresh: true }),
            refreshPrices({ registry, requireFresh: true }),
          ],
          { concurrency: "unbounded" },
        );
      }),
    );
    expect(requests).toBe(1);
  });
});
