import Coingecko from "@coingecko/coingecko-typescript";
import { SqlClient } from "effect/unstable/sql";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { randomUUID } from "node:crypto";
import YahooFinance from "yahoo-finance2";

import {
  DEFAULT_MARKET_DATA_POLICY,
  DEFAULT_MARKET_DATA_PROVIDER_BY_ASSET_CATEGORY,
  DEFAULT_REPORTING_CURRENCY,
} from "./config.js";
import { mergeConnectorAssetDuplicates } from "./connector.js";
import type { AssetSearchResult } from "./contracts.js";
import { FinanceApiError } from "./contracts.js";

export type MarketDataProviderId = "yahoo-finance" | "coingecko";

export interface ProviderLookup {
  readonly assetIds: ReadonlyArray<string>;
  readonly lookupKey: string;
  readonly kind: "security" | "fiat" | "coin" | "contract";
  readonly platform?: string;
}

export interface ProviderObservation {
  readonly lookupKey: string;
  readonly price: number;
  readonly currencyIso: string;
  readonly observedAt: Date;
}

export interface ProviderFailure {
  readonly lookupKey: string;
  readonly category: "not-found" | "invalid-response" | "rate-limit" | "network" | "server";
  readonly message: string;
}

export interface ProviderBatchResult {
  readonly observations: ReadonlyArray<ProviderObservation>;
  readonly failures: ReadonlyArray<ProviderFailure>;
}

export class ProviderBatchError extends Error {
  readonly transient: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: { readonly transient: boolean; readonly retryAfterMs?: number },
  ) {
    super(message);
    this.name = "ProviderBatchError";
    this.transient = options.transient;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export interface MarketDataProvider {
  readonly id: MarketDataProviderId;
  readonly chunkSize: number;
  readonly fetchPrices: (
    lookups: ReadonlyArray<ProviderLookup>,
    reportingCurrency: string,
  ) => Effect.Effect<ProviderBatchResult, ProviderBatchError>;
}

const makeCoinGeckoClient = () => {
  const demoAPIKey = process.env["COINGECKO_DEMO_API_KEY"]?.trim() || null;
  return new Coingecko({
    environment: "demo",
    demoAPIKey,
    timeout: Duration.toMillis(DEFAULT_MARKET_DATA_POLICY.requestTimeout),
    maxRetries: 0,
    // CoinGecko's public API does not require a key, but the SDK requires an
    // explicit opt-out when no demo key is configured.
    ...(demoAPIKey === null ? { defaultHeaders: { "x-cg-demo-api-key": null } } : {}),
  });
};

const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const asBatchError = (provider: MarketDataProviderId, cause: unknown) => {
  const status =
    typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    typeof cause.status === "number"
      ? cause.status
      : undefined;
  const headers =
    typeof cause === "object" && cause !== null && "headers" in cause ? cause.headers : undefined;
  const retryAfter =
    typeof headers === "object" &&
    headers !== null &&
    "get" in headers &&
    typeof headers.get === "function"
      ? headers.get("retry-after")
      : undefined;
  const retryAfterMs =
    typeof retryAfter === "string" && /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1_000
      : undefined;
  return new ProviderBatchError(`${provider} request failed`, {
    transient: status === undefined || status === 429 || status >= 500,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
};

export const makeYahooFinanceProvider = (
  client: InstanceType<typeof YahooFinance> = new YahooFinance(),
): MarketDataProvider => ({
  id: "yahoo-finance",
  chunkSize: 50,
  fetchPrices: (lookups, reportingCurrency) =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          Duration.toMillis(DEFAULT_MARKET_DATA_POLICY.requestTimeout),
        );
        const bySymbol = new Map(lookups.map((lookup) => [lookup.lookupKey, lookup] as const));
        const quotes = await client
          .quote(
            [...bySymbol.keys()],
            {
              fields: [
                "symbol",
                "regularMarketPrice",
                "currency",
                "quoteType",
                "regularMarketTime",
              ],
              return: "array",
            },
            { fetchOptions: { signal: controller.signal } },
          )
          .finally(() => clearTimeout(timeout));
        const observations: ProviderObservation[] = [];
        const failures: ProviderFailure[] = [];
        const seen = new Set<string>();
        for (const quote of quotes) {
          const lookup = bySymbol.get(quote.symbol);
          if (lookup === undefined) continue;
          seen.add(quote.symbol);
          const expectedType = lookup.kind === "security" ? ["EQUITY", "ETF"] : ["CURRENCY"];
          const currency = quote.currency?.toUpperCase();
          if (
            !expectedType.includes(quote.quoteType) ||
            !finitePositive(quote.regularMarketPrice) ||
            currency === undefined ||
            !/^[A-Z]{3}$/.test(currency) ||
            !(quote.regularMarketTime instanceof Date) ||
            Number.isNaN(quote.regularMarketTime.getTime()) ||
            (lookup.kind === "fiat" && currency !== reportingCurrency)
          ) {
            failures.push({
              lookupKey: lookup.lookupKey,
              category: "invalid-response",
              message: "Yahoo returned an invalid quote",
            });
            continue;
          }
          observations.push({
            lookupKey: lookup.lookupKey,
            price: quote.regularMarketPrice,
            currencyIso: currency,
            observedAt: quote.regularMarketTime,
          });
        }
        for (const lookup of lookups) {
          if (!seen.has(lookup.lookupKey))
            failures.push({
              lookupKey: lookup.lookupKey,
              category: "not-found",
              message: "Yahoo returned no quote",
            });
        }
        return { observations, failures };
      },
      catch: (cause) => asBatchError("yahoo-finance", cause),
    }),
});

export const makeCoinGeckoProvider = (client = makeCoinGeckoClient()): MarketDataProvider => ({
  id: "coingecko",
  chunkSize: 500,
  fetchPrices: (lookups, reportingCurrency) =>
    Effect.tryPromise({
      try: async () => {
        const observations: ProviderObservation[] = [];
        const failures: ProviderFailure[] = [];
        const currency = reportingCurrency.toLowerCase();
        const coinLookups = lookups.filter((lookup) => lookup.kind === "coin");
        if (coinLookups.length > 0) {
          const response = await client.simple.price.get({
            ids: coinLookups.map(({ lookupKey }) => lookupKey).join(","),
            vs_currencies: currency,
            include_last_updated_at: true,
          });
          for (const lookup of coinLookups) {
            const item = response[lookup.lookupKey] as
              | Readonly<Record<string, unknown>>
              | undefined;
            const price = item?.[currency];
            const timestamp = item?.["last_updated_at"];
            if (!finitePositive(price) || !finitePositive(timestamp)) {
              failures.push({
                lookupKey: lookup.lookupKey,
                category: "invalid-response",
                message: "CoinGecko returned no valid current price",
              });
              continue;
            }
            observations.push({
              lookupKey: lookup.lookupKey,
              price,
              currencyIso: reportingCurrency,
              observedAt: new Date(timestamp * 1000),
            });
          }
        }
        const contracts = Map.groupBy(
          lookups.filter((lookup) => lookup.kind === "contract"),
          (lookup) => lookup.platform ?? "",
        );
        for (const [platform, group] of contracts) {
          if (!platform) {
            failures.push(
              ...group.map((lookup) => ({
                lookupKey: lookup.lookupKey,
                category: "invalid-response" as const,
                message: "CoinGecko contract has no platform",
              })),
            );
            continue;
          }
          const response = await client.simple.tokenPrice.getID(platform, {
            contract_addresses: group.map(({ lookupKey }) => lookupKey).join(","),
            vs_currencies: currency,
            include_last_updated_at: true,
          });
          for (const lookup of group) {
            const item = response[lookup.lookupKey.toLowerCase()] as
              | Readonly<Record<string, unknown>>
              | undefined;
            const price = item?.[currency];
            const timestamp = item?.["last_updated_at"];
            if (!finitePositive(price) || !finitePositive(timestamp)) {
              failures.push({
                lookupKey: lookup.lookupKey,
                category: "invalid-response",
                message: "CoinGecko returned no valid token price",
              });
              continue;
            }
            observations.push({
              lookupKey: lookup.lookupKey,
              price,
              currencyIso: reportingCurrency,
              observedAt: new Date(timestamp * 1000),
            });
          }
        }
        return { observations, failures };
      },
      catch: (cause) => asBatchError("coingecko", cause),
    }),
});

export type MarketDataRegistry = ReadonlyMap<MarketDataProviderId, MarketDataProvider>;

export const LiveMarketDataRegistry: MarketDataRegistry = new Map([
  ["yahoo-finance", makeYahooFinanceProvider()],
  ["coingecko", makeCoinGeckoProvider()],
]);

const yahooSearchClient = new YahooFinance();
const coinGeckoSearchClient = makeCoinGeckoClient();
const searchCache = new Map<
  string,
  { readonly expiresAt: number; readonly results: ReadonlyArray<AssetSearchResult> }
>();

export const searchAssets = (
  queryInput: string,
  assetCategory: "stocks_etfs" | "crypto",
): Effect.Effect<ReadonlyArray<AssetSearchResult>, FinanceApiError> => {
  const query = queryInput.trim();
  if (query.length < 2) return Effect.succeed([]);
  const cacheKey = `${assetCategory}:${query.toLocaleLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAt > Date.now()) return Effect.succeed(cached.results);

  return Effect.tryPromise({
    try: async () => {
      let results: ReadonlyArray<AssetSearchResult>;
      if (assetCategory === "stocks_etfs") {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          Duration.toMillis(DEFAULT_MARKET_DATA_POLICY.requestTimeout),
        );
        const response = await yahooSearchClient
          .search(
            query,
            { quotesCount: 10, newsCount: 0 },
            { fetchOptions: { signal: controller.signal } },
          )
          .finally(() => clearTimeout(timeout));
        results = response.quotes.flatMap((quote) =>
          quote.isYahooFinance && (quote.quoteType === "EQUITY" || quote.quoteType === "ETF")
            ? [
                {
                  provider: "yahoo-finance" as const,
                  assetCategory: "stocks_etfs" as const,
                  name: quote.longname ?? quote.shortname ?? quote.symbol,
                  symbol: quote.symbol,
                  identifiers: [{ type: "yahoo_symbol", value: quote.symbol }],
                },
              ]
            : [],
        );
      } else {
        const response = await coinGeckoSearchClient.search.get({ query });
        results = response.coins.slice(0, 10).map((coin) => ({
          provider: "coingecko" as const,
          assetCategory: "crypto" as const,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          identifiers: [{ type: "coingecko_coin_id", value: coin.id }],
        }));
      }
      searchCache.set(cacheKey, { expiresAt: Date.now() + 60_000, results });
      return results;
    },
    catch: () => new FinanceApiError({ code: "validation", message: "Market-data search failed" }),
  });
};

interface RefreshAssetRow {
  readonly id: string;
  readonly asset_category: "cash" | "stocks_etfs" | "crypto";
  readonly name: string;
  readonly symbol: string | null;
  readonly observed_at: string | null;
}

interface IdentifierRow {
  readonly asset_id: string;
  readonly identifier_type: string;
  readonly identifier_value: string;
}

type AssetSearch = (
  query: string,
  assetCategory: "stocks_etfs" | "crypto",
) => Effect.Effect<ReadonlyArray<AssetSearchResult>, FinanceApiError>;

export interface RefreshPricesOptions {
  readonly assetIds?: ReadonlyArray<string>;
  readonly requireFresh?: boolean;
  readonly registry?: MarketDataRegistry;
  /** Automatically resolve an unlinked asset through the provider search index. */
  readonly resolveMissingLookups?: boolean;
  readonly searchAssets?: AssetSearch;
}

export interface RefreshPricesResult {
  readonly refreshedAssetIds: ReadonlyArray<string>;
  readonly failures: ReadonlyArray<{
    readonly assetId: string;
    readonly provider: MarketDataProviderId;
    readonly category: string;
    readonly message: string;
  }>;
}

const chunks = <A>(items: ReadonlyArray<A>, size: number) => {
  const result: Array<ReadonlyArray<A>> = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
};

const retryBatch = (
  provider: MarketDataProvider,
  batch: ReadonlyArray<ProviderLookup>,
  attempt = 1,
): Effect.Effect<ProviderBatchResult, never> =>
  provider.fetchPrices(batch, DEFAULT_REPORTING_CURRENCY).pipe(
    Effect.catch((error) => {
      if (error.transient && attempt < DEFAULT_MARKET_DATA_POLICY.maxAttempts) {
        const baseDelay = Math.min(250 * 2 ** (attempt - 1), 2_000);
        const delay = error.retryAfterMs ?? baseDelay + Math.floor(Math.random() * baseDelay * 0.2);
        return Effect.sleep(Duration.millis(delay)).pipe(
          Effect.flatMap(() => retryBatch(provider, batch, attempt + 1)),
        );
      }
      return Effect.succeed({
        observations: [],
        failures: batch.map(({ lookupKey }) => ({
          lookupKey,
          category: error.transient ? ("network" as const) : ("invalid-response" as const),
          message: error.message,
        })),
      });
    }),
  );

const inFlightBatches = new Map<string, Promise<ProviderBatchResult>>();

const singleFlightBatch = (
  provider: MarketDataProvider,
  batch: ReadonlyArray<ProviderLookup>,
): Effect.Effect<ProviderBatchResult> => {
  const key = `${provider.id}:${batch
    .map(({ lookupKey }) => lookupKey)
    .sort()
    .join("\u0000")}`;
  const existing = inFlightBatches.get(key);
  if (existing !== undefined) return Effect.promise(() => existing);
  return Effect.suspend(() => {
    const race = inFlightBatches.get(key);
    if (race !== undefined) return Effect.promise(() => race);
    const promise = Effect.runPromise(retryBatch(provider, batch));
    inFlightBatches.set(key, promise);
    void promise.finally(() => inFlightBatches.delete(key));
    return Effect.promise(() => promise);
  });
};

const ensureFiat = (iso: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const existing = yield* sql<{
      readonly asset_id: string;
    }>`SELECT asset_id FROM asset_identifiers
      WHERE identifier_type = 'iso_currency' AND identifier_value = ${iso}`;
    if (existing[0] !== undefined) return existing[0].asset_id;
    const id = `fiat:${iso}`;
    const timestamp = new Date().toISOString();
    yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
      VALUES (${id}, 'cash', ${iso}, ${iso}, ${timestamp}, ${timestamp})`;
    yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
      VALUES (${randomUUID()}, ${id}, 'iso_currency', ${iso})`;
    return id;
  });

const lookupForAsset = (
  assetCategory: RefreshAssetRow["asset_category"],
  values: ReadonlyArray<IdentifierRow>,
): Omit<ProviderLookup, "assetIds"> | undefined => {
  if (assetCategory === "stocks_etfs") {
    const symbol = values.find(
      ({ identifier_type }) => identifier_type === "yahoo_symbol",
    )?.identifier_value;
    return symbol === undefined ? undefined : { lookupKey: symbol, kind: "security" };
  }
  if (assetCategory === "cash") {
    const iso = values.find(
      ({ identifier_type }) => identifier_type === "iso_currency",
    )?.identifier_value;
    if (iso === undefined || iso === DEFAULT_REPORTING_CURRENCY) return undefined;
    return { lookupKey: `${iso}${DEFAULT_REPORTING_CURRENCY}=X`, kind: "fiat" };
  }
  const coin = values.find(
    ({ identifier_type }) => identifier_type === "coingecko_coin_id",
  )?.identifier_value;
  if (coin !== undefined) return { lookupKey: coin, kind: "coin" };
  const contract = values.find(
    ({ identifier_type }) => identifier_type === "contract_address",
  )?.identifier_value;
  const platform = values.find(
    ({ identifier_type }) => identifier_type === "coingecko_platform",
  )?.identifier_value;
  return contract !== undefined && platform !== undefined
    ? { lookupKey: contract, kind: "contract", platform }
    : undefined;
};

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase();

const selectAutomaticAssetMatch = (
  asset: Pick<RefreshAssetRow, "name" | "symbol" | "asset_category">,
  results: ReadonlyArray<AssetSearchResult>,
) => {
  const candidates = results.filter(({ assetCategory }) => assetCategory === asset.asset_category);
  const symbol = asset.symbol === null ? undefined : normalizeSearchText(asset.symbol);
  const name = normalizeSearchText(asset.name);
  const exactNameAndSymbol = candidates.filter(
    (candidate) =>
      normalizeSearchText(candidate.name) === name &&
      symbol !== undefined &&
      normalizeSearchText(candidate.symbol) === symbol,
  );
  if (exactNameAndSymbol.length === 1) return exactNameAndSymbol[0];
  const exactSymbol =
    symbol === undefined
      ? []
      : candidates.filter(
          ({ symbol: candidateSymbol }) => normalizeSearchText(candidateSymbol) === symbol,
        );
  if (exactSymbol.length === 1) return exactSymbol[0];
  const exactName = candidates.filter(
    ({ name: candidateName }) => normalizeSearchText(candidateName) === name,
  );
  return exactName.length === 1 ? exactName[0] : undefined;
};

const selectIsinAssetMatch = (
  asset: Pick<RefreshAssetRow, "name" | "symbol" | "asset_category">,
  results: ReadonlyArray<AssetSearchResult>,
) => {
  const candidates = results.filter(({ assetCategory }) => assetCategory === "stocks_etfs");
  if (candidates.length === 1) return candidates[0];
  // Yahoo does not return the ISIN in every search result. If it returns
  // several listings, only accept one whose displayed identity still agrees
  // with the imported name and ticker; never guess between exchanges.
  return selectAutomaticAssetMatch(asset, candidates);
};

interface DiscoveredAssetIdentifiers {
  readonly source: "isin" | "fallback" | "error";
  readonly identifiers: ReadonlyArray<IdentifierRow>;
}

const discoverAssetIdentifiers = (
  asset: RefreshAssetRow,
  values: ReadonlyArray<IdentifierRow>,
  search: AssetSearch,
): Effect.Effect<DiscoveredAssetIdentifiers, never> => {
  if (asset.asset_category === "cash") return Effect.succeed({ source: "fallback", identifiers: [] });
  const isin = values.find(({ identifier_type }) => identifier_type === "isin")?.identifier_value;
  if (asset.asset_category === "stocks_etfs" && isin !== undefined && isin.trim().length > 0) {
    return search(isin.trim(), "stocks_etfs").pipe(
      Effect.map((results) => {
        const match = selectIsinAssetMatch(asset, results);
        return {
          source: "isin" as const,
          identifiers:
            match?.identifiers.map(({ type, value }) => ({
              asset_id: asset.id,
              identifier_type: type,
              identifier_value: value,
            })) ?? [],
        };
      }),
      // A provider outage should not erase a previously reviewed lookup.
      Effect.catch(() => Effect.succeed({ source: "error" as const, identifiers: [] })),
    );
  }
  const query = asset.symbol?.trim() || asset.name.trim();
  if (query.length === 0) return Effect.succeed({ source: "fallback", identifiers: [] });
  return search(query, asset.asset_category).pipe(
    Effect.map((results) => {
      const match = selectAutomaticAssetMatch(asset, results);
      return {
        source: "fallback" as const,
        identifiers:
          match?.identifiers.map(({ type, value }) => ({
            asset_id: asset.id,
            identifier_type: type,
            identifier_value: value,
          })) ?? [],
      };
    }),
    Effect.catch(() => Effect.succeed({ source: "error" as const, identifiers: [] })),
  );
};

const findExistingAssetIdentifiers = (asset: RefreshAssetRow, sql: SqlClient.SqlClient) => {
  const symbol = asset.symbol?.trim();
  if (symbol === undefined || symbol.length === 0) return Effect.succeed([]);
  return Effect.gen(function* () {
    const rows = yield* sql<IdentifierRow & { readonly source_asset_id: string }>`SELECT
        ai.asset_id, ai.identifier_type, ai.identifier_value, candidate.id AS source_asset_id
      FROM assets candidate
      JOIN asset_identifiers ai ON ai.asset_id = candidate.id
      WHERE candidate.id <> ${asset.id}
        AND candidate.asset_category = ${asset.asset_category}
        AND candidate.symbol IS NOT NULL
        AND lower(trim(candidate.symbol)) = lower(trim(${symbol}))
        AND ai.identifier_type IN ('coingecko_coin_id', 'coingecko_platform', 'contract_address', 'yahoo_symbol')`;
    const sourceAssetIds = [...new Set(rows.map(({ source_asset_id }) => source_asset_id))];
    if (sourceAssetIds.length !== 1) return [];
    return rows.map(({ identifier_type, identifier_value }) => ({
      asset_id: asset.id,
      identifier_type,
      identifier_value,
    }));
  });
};

const refreshPriceAssets = (
  options: RefreshPricesOptions = {},
): Effect.Effect<RefreshPricesResult, FinanceApiError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(mergeConnectorAssetDuplicates());
    const selected = options.assetIds;
    const assets =
      selected === undefined
        ? yield* sql<RefreshAssetRow>`SELECT DISTINCT a.id, a.asset_category, a.name, a.symbol, ap.observed_at
          FROM assets a LEFT JOIN asset_prices ap ON ap.asset_id = a.id
          WHERE a.asset_category IN ('stocks_etfs', 'crypto', 'cash') AND (
            EXISTS (SELECT 1 FROM positions p WHERE p.asset_id = a.id) OR
            EXISTS (SELECT 1 FROM accounts ac WHERE ac.base_currency_asset_id = a.id)
          )`
        : yield* sql<RefreshAssetRow>`SELECT a.id, a.asset_category, a.name, a.symbol, ap.observed_at
          FROM assets a LEFT JOIN asset_prices ap ON ap.asset_id = a.id
          WHERE a.asset_category IN ('stocks_etfs', 'crypto', 'cash') AND a.id IN ${sql.in(selected)}`;
    const freshnessCutoff =
      Date.now() - Duration.toMillis(DEFAULT_MARKET_DATA_POLICY.priceFreshness);
    const due = assets.filter(
      (asset) =>
        options.requireFresh ||
        asset.observed_at === null ||
        Date.parse(asset.observed_at) < freshnessCutoff,
    );
    const ids = due.map(({ id }) => id);
    if (ids.length === 0) return { refreshedAssetIds: [], failures: [] };
    const identifiers = yield* sql<IdentifierRow>`SELECT asset_id, identifier_type, identifier_value
      FROM asset_identifiers WHERE asset_id IN ${sql.in(ids)}`;
    const byAsset = Map.groupBy(identifiers, ({ asset_id }) => asset_id);
    const search = options.searchAssets ?? searchAssets;
    const providerLookups = new Map<MarketDataProviderId, Map<string, ProviderLookup>>();
    const skipped: RefreshPricesResult["failures"][number][] = [];
    for (const asset of due) {
      const providerId = DEFAULT_MARKET_DATA_PROVIDER_BY_ASSET_CATEGORY[asset.asset_category];
      const values = byAsset.get(asset.id) ?? [];
      let lookup = lookupForAsset(asset.asset_category, values);
      const hasIsin =
        asset.asset_category === "stocks_etfs" &&
        values.some(
          ({ identifier_type, identifier_value }) =>
            identifier_type === "isin" && identifier_value.trim().length > 0,
        );
      if (options.resolveMissingLookups !== false && asset.asset_category !== "cash" && hasIsin) {
        // An imported ISIN is more precise than the broker's bare ticker. Use
        // it even when a previous sync left a guessed yahoo_symbol behind.
        const discovered = yield* discoverAssetIdentifiers(asset, values, search);
        if (discovered.source === "isin") {
          yield* sql`DELETE FROM asset_identifiers
            WHERE asset_id = ${asset.id} AND identifier_type = 'yahoo_symbol'`;
          yield* sql`DELETE FROM asset_prices
            WHERE asset_id = ${asset.id} AND source = 'yahoo-finance'`;
          for (const identifier of discovered.identifiers) {
            yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
              VALUES (${randomUUID()}, ${asset.id}, ${identifier.identifier_type}, ${identifier.identifier_value})
              ON CONFLICT(identifier_type, identifier_value) DO NOTHING`;
          }
          const yahoo = discovered.identifiers.find(
            ({ identifier_type }) => identifier_type === "yahoo_symbol",
          );
          lookup =
            yahoo === undefined
              ? undefined
              : { lookupKey: yahoo.identifier_value, kind: "security" };
        }
      } else if (
        lookup === undefined &&
        options.resolveMissingLookups !== false &&
        asset.asset_category !== "cash"
      ) {
        const existing = yield* findExistingAssetIdentifiers(asset, sql);
        const discovered =
          existing.length > 0
            ? { source: "fallback" as const, identifiers: existing }
            : yield* discoverAssetIdentifiers(asset, values, search);
        if (discovered.identifiers.length > 0) {
          for (const identifier of discovered.identifiers) {
            yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
              VALUES (${randomUUID()}, ${asset.id}, ${identifier.identifier_type}, ${identifier.identifier_value})
              ON CONFLICT(identifier_type, identifier_value) DO NOTHING`;
          }
          lookup = lookupForAsset(asset.asset_category, [...values, ...discovered.identifiers]);
        }
      }
      if (
        asset.asset_category === "cash" &&
        values.some(
          ({ identifier_type, identifier_value }) =>
            identifier_type === "iso_currency" && identifier_value === DEFAULT_REPORTING_CURRENCY,
        )
      )
        continue;
      if (lookup === undefined) {
        skipped.push({
          assetId: asset.id,
          provider: providerId,
          category: "missing-lookup",
          message: "Asset has no provider lookup identifier",
        });
        continue;
      }
      const providerMap = providerLookups.get(providerId) ?? new Map<string, ProviderLookup>();
      const existing = providerMap.get(lookup.lookupKey);
      providerMap.set(lookup.lookupKey, {
        ...lookup,
        assetIds: [...(existing?.assetIds ?? []), asset.id],
      });
      providerLookups.set(providerId, providerMap);
    }
    const registry = options.registry ?? LiveMarketDataRegistry;
    const providerResults = yield* Effect.forEach(
      [...providerLookups],
      ([providerId, lookupMap]) => {
        const provider = registry.get(providerId);
        if (provider === undefined)
          return Effect.succeed({
            providerId,
            lookups: lookupMap,
            results: [] as ReadonlyArray<ProviderBatchResult>,
          });
        return Effect.forEach(
          chunks([...lookupMap.values()], provider.chunkSize),
          (batch) => singleFlightBatch(provider, batch),
          {
            concurrency: DEFAULT_MARKET_DATA_POLICY.maxConcurrentBatchesPerProvider,
          },
        ).pipe(Effect.map((results) => ({ providerId, lookups: lookupMap, results })));
      },
      { concurrency: "unbounded" },
    );
    const refreshed = new Set<string>();
    const failures = [...skipped];
    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const { providerId, lookups, results } of providerResults) {
          for (const result of results) {
            for (const observation of result.observations) {
              const currencyId = yield* ensureFiat(observation.currencyIso.toUpperCase());
              for (const assetId of lookups.get(observation.lookupKey)?.assetIds ?? []) {
                const updatedAt = new Date().toISOString();
                yield* sql`INSERT INTO asset_prices (asset_id, price, currency_asset_id, source, observed_at, updated_at)
                  VALUES (${assetId}, ${observation.price}, ${currencyId}, ${providerId}, ${observation.observedAt.toISOString()}, ${updatedAt})
                  ON CONFLICT(asset_id) DO UPDATE SET price = excluded.price,
                    currency_asset_id = excluded.currency_asset_id, source = excluded.source,
                    observed_at = excluded.observed_at, updated_at = excluded.updated_at`;
                refreshed.add(assetId);
              }
            }
            for (const providerFailure of result.failures) {
              for (const assetId of lookups.get(providerFailure.lookupKey)?.assetIds ?? []) {
                failures.push({
                  assetId,
                  provider: providerId,
                  category: providerFailure.category,
                  message: providerFailure.message,
                });
              }
            }
          }
        }
      }),
    );
    return { refreshedAssetIds: [...refreshed], failures };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof FinanceApiError
        ? cause
        : new FinanceApiError({ code: "database", message: "Price refresh failed" }),
    ),
  );

export const refreshPrices = (
  options: RefreshPricesOptions = {},
): Effect.Effect<RefreshPricesResult, FinanceApiError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const primary = yield* refreshPriceAssets(options);
    const sql = yield* SqlClient.SqlClient;
    const quoteCurrencies = yield* sql<{
      readonly id: string;
    }>`SELECT DISTINCT ap.currency_asset_id AS id
      FROM asset_prices ap
      JOIN positions position ON position.asset_id = ap.asset_id
      JOIN assets currency ON currency.id = ap.currency_asset_id
      WHERE currency.asset_category = 'cash'
        AND ap.currency_asset_id <> ${`fiat:${DEFAULT_REPORTING_CURRENCY}`}`;

    if (quoteCurrencies.length === 0) return primary;

    const currencies = yield* refreshPriceAssets({
      assetIds: quoteCurrencies.map(({ id }) => id),
      ...(options.registry === undefined ? {} : { registry: options.registry }),
      ...(options.requireFresh === undefined ? {} : { requireFresh: options.requireFresh }),
      ...(options.resolveMissingLookups === undefined
        ? {}
        : { resolveMissingLookups: options.resolveMissingLookups }),
      ...(options.searchAssets === undefined ? {} : { searchAssets: options.searchAssets }),
    });

    return {
      refreshedAssetIds: [
        ...new Set([...primary.refreshedAssetIds, ...currencies.refreshedAssetIds]),
      ],
      failures: [...primary.failures, ...currencies.failures],
    };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof FinanceApiError
        ? cause
        : new FinanceApiError({ code: "database", message: "Price refresh failed" }),
    ),
  );
