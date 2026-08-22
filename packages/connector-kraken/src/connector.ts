import { HttpClient } from "effect/unstable/http";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  Connector,
  ConnectorAccount,
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  addDecimal,
  canonicalDecimal,
  validateConnectorOutput,
} from "@satella-app/connector-core";
import {
  KRAKEN_REST_ORIGIN,
  KrakenTransportError,
  makeEffectHttpTransport,
  makeKrakenClient,
  type KrakenClient,
  type KrakenHttpTransport,
} from "./client.js";
import {
  KrakenBalanceResponse,
  KrakenCredentials,
  KrakenEarnAllocationsResponse,
  KrakenEarnStrategiesResponse,
} from "./schemas.js";
import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

const BALANCE_PATH = "/0/private/Balance";
const EARN_ALLOCATIONS_PATH = "/0/private/Earn/Allocations";
const EARN_STRATEGIES_PATH = "/0/private/Earn/Strategies";

/** Balances held under these suffixes are staked and sit outside the spot wallet. */
const STAKED_EXTENSIONS = new Set(["S", "B"]);

/**
 * Reward variants (.M opt-in rewards, .F Kraken Rewards auto-earn) remain
 * spendable wallet equity, so they stay in the Spot account.
 */
const REWARD_EXTENSIONS = new Set(["F", "M"]);

/** Kraken renames a handful of well-known assets away from their common symbols. */
const SYMBOL_RENAMES = new Map([
  ["XBT", "BTC"],
  ["ETH2", "ETH"],
  ["XDG", "DOGE"],
]);

// Kraken supports fiat funding, so fiat balances on exchange surface as cash.
const FIAT_CURRENCIES = new Set([
  "AED",
  "ARS",
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CLP",
  "CNY",
  "CNH",
  "COP",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "KZT",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PEN",
  "PHP",
  "PKR",
  "PLN",
  "RON",
  "RUB",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "TWD",
  "UAH",
  "USD",
  "UYU",
  "VND",
  "ZAR",
]);

interface KrakenAssetKey {
  readonly rawCode: string;
  readonly externalId: string;
  readonly name: string;
  readonly symbol: string;
  readonly assetCategory: "crypto" | "cash" | "stocks_etfs";
}

/**
 * Kraken uses legacy prefixed codes (`XXBT`, `ZUSD`), product suffixes
 * (`ETH2.S`, `ADA.F`, `TSLA.T`) and its own names (`XBT`). Positions are
 * reported under the common symbol while the raw Kraken code is preserved as
 * the provenance identifier.
 */
const krakenAssetKey = (code: string): KrakenAssetKey => {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9._-]+$/.test(normalized)) {
    throw new Error(`Kraken returned an invalid currency code: ${code}`);
  }
  const separator = normalized.indexOf(".");
  const base = separator === -1 ? normalized : normalized.slice(0, separator);
  const extension = separator === -1 ? undefined : normalized.slice(separator + 1);
  let stripped = base;
  if (stripped.length === 4 && (stripped.startsWith("X") || stripped.startsWith("Z"))) {
    stripped = stripped.slice(1);
  }
  const common = SYMBOL_RENAMES.get(stripped) ?? stripped;
  const tokenized = extension === "T";
  let displayedExtension = "";
  if (
    extension !== undefined &&
    !STAKED_EXTENSIONS.has(extension) &&
    !REWARD_EXTENSIONS.has(extension) &&
    !tokenized
  ) {
    displayedExtension = `.${extension}`;
  }
  const display = `${common}${displayedExtension}`;
  return {
    rawCode: normalized,
    externalId: `kraken:currency:${normalized}`,
    name: display,
    symbol: display,
    assetCategory: FIAT_CURRENCIES.has(common) ? "cash" : tokenized ? "stocks_etfs" : "crypto",
  };
};

interface AccumulatedPosition {
  readonly key: KrakenAssetKey;
  quantity: string;
}

const accumulateQuantity = (
  positions: Map<string, AccumulatedPosition>,
  code: string,
  amount: string,
  buildKey: (code: string) => KrakenAssetKey,
): void => {
  const quantity = canonicalDecimalOrThrow(amount, code);
  if (quantity === "0") return;
  const existing = positions.get(code);
  if (existing !== undefined) {
    existing.quantity = addDecimal(existing.quantity, quantity);
    return;
  }
  positions.set(code, { key: buildKey(code), quantity });
};

const canonicalDecimalOrThrow = (value: string, code: string): string => {
  if (value.trim() === "") {
    throw new Error(`Kraken returned an invalid ${code} balance`);
  }
  try {
    return canonicalDecimal(value);
  } catch {
    throw new Error(`Kraken returned an invalid ${code} balance`);
  }
};

type KrakenEnvelope = {
  readonly error: ReadonlyArray<string>;
};

const ensureAuthSuccess = <A extends KrakenEnvelope>(
  response: A,
): Effect.Effect<A, ConnectorAuthenticationError> => {
  if (response.error.length === 0) return Effect.succeed(response);
  const message = response.error.join(", ");
  return Effect.fail(
    new ConnectorAuthenticationError({
      category: apiErrorCategory(response.error[0] ?? message, "authentication"),
      message: `Kraken rejected the authentication request: ${message}`,
    }),
  );
};

const ensureFetchSuccess = <A extends KrakenEnvelope>(
  response: A,
): Effect.Effect<A, ConnectorFetchAccountsError> => {
  if (response.error.length === 0) return Effect.succeed(response);
  const message = response.error.join(", ");
  return Effect.fail(
    new ConnectorFetchAccountsError({
      category: apiErrorCategory(response.error[0] ?? message, "fetch"),
      message: `Kraken rejected the account request: ${message}`,
    }),
  );
};

function apiErrorCategory(
  message: string,
  phase: "authentication",
): ConnectorAuthenticationError["category"];
function apiErrorCategory(message: string, phase: "fetch"): ConnectorFetchAccountsError["category"];
function apiErrorCategory(
  message: string,
  phase: "authentication" | "fetch",
): ConnectorAuthenticationError["category"] | ConnectorFetchAccountsError["category"] {
  if (/permission denied/i.test(message)) {
    return phase === "authentication" ? "insufficient_permission" : "authentication_expired";
  }
  if (/invalid nonce|invalid key|invalid signature/i.test(message)) {
    return phase === "authentication" ? "invalid_credentials" : "authentication_expired";
  }
  if (/rate limit|temporary ban|too many requests/i.test(message)) return "rate_limit";
  return "invalid_response";
}

function transportErrorCategory(
  cause: unknown,
  phase: "authentication",
): ConnectorAuthenticationError["category"];
function transportErrorCategory(
  cause: unknown,
  phase: "fetch",
): ConnectorFetchAccountsError["category"];
function transportErrorCategory(
  cause: unknown,
  phase: "authentication" | "fetch",
): ConnectorAuthenticationError["category"] | ConnectorFetchAccountsError["category"] {
  if (cause instanceof KrakenTransportError) {
    if (cause.status === 401) {
      return phase === "authentication" ? "invalid_credentials" : "authentication_expired";
    }
    if (cause.status === 403) {
      return phase === "authentication" ? "insufficient_permission" : "authentication_expired";
    }
    if (cause.status === 429) return "rate_limit";
    if (cause.message.includes("timed out")) return "timeout";
    return cause.transient ? "network" : "invalid_response";
  }
  return "invalid_response";
}

const buildAccounts = (
  balance: typeof KrakenBalanceResponse.Type,
  strategies: typeof KrakenEarnStrategiesResponse.Type,
  allocations: typeof KrakenEarnAllocationsResponse.Type,
): ReadonlyArray<ConnectorAccount> => {
  // Kraken's private balance endpoints carry no lifetime acquisition cost, so
  // this connector intentionally imports balances without purchase prices.
  //
  // Double-counting rules: "flex" (Kraken Rewards) strategies earn on spot
  // balances that remain inside /private/Balance, so their allocations are
  // skipped entirely; bonded, instant and timed allocations move out of the
  // spot wallet and are only reported here. Earn positions are keyed by
  // common symbol so allocation rows and migrated staking rows of the same
  // asset merge into one position.
  const lockTypeByStrategyId = new Map<string, string>();
  const strategiesResult = strategies.result;
  if (strategiesResult !== null) {
    for (const item of strategiesResult.items) {
      lockTypeByStrategyId.set(item.id, item.lock_type.type);
    }
  }

  const earn = new Map<string, AccumulatedPosition>();
  const allocatedSymbols = new Set<string>();
  const addEarnQuantity = (code: string, amount: string): void => {
    const key = krakenAssetKey(code);
    const quantity = canonicalDecimalOrThrow(amount, code);
    if (quantity === "0") return;
    const existing = earn.get(key.symbol);
    if (existing === undefined) {
      earn.set(key.symbol, { key: { ...key, assetCategory: "crypto" }, quantity });
      return;
    }
    existing.quantity = addDecimal(existing.quantity, quantity);
  };
  const allocationsResult = allocations.result;
  if (allocationsResult !== null) {
    for (const item of allocationsResult.items) {
      const lockType =
        item.strategy_id === undefined ? undefined : lockTypeByStrategyId.get(item.strategy_id);
      if (lockType === "flex") continue;
      allocatedSymbols.add(krakenAssetKey(item.native_asset).symbol);
      addEarnQuantity(item.native_asset, item.amount_allocated.total.native);
    }
  }

  const spot = new Map<string, AccumulatedPosition>();
  const balanceResult = balance.result;
  if (balanceResult !== null) {
    for (const [code, amount] of Object.entries(balanceResult)) {
      const separator = code.indexOf(".");
      const extension = separator === -1 ? undefined : code.slice(separator + 1);
      if (extension !== undefined && STAKED_EXTENSIONS.has(extension)) {
        // Staked balances are owned by the Earn side of the ledger. When
        // Kraken already reports the asset through a non-flex Earn
        // allocation, that total wins and the migrated balance row is
        // skipped so funds are not counted twice.
        if (allocatedSymbols.has(krakenAssetKey(code).symbol)) continue;
        addEarnQuantity(code, amount);
        continue;
      }
      accumulateQuantity(spot, code, amount, krakenAssetKey);
    }
  }

  const toPositions = (entries: Iterable<AccumulatedPosition>): ConnectorAccount["positions"] =>
    [...entries].map(({ key, quantity }) => ({
      asset: {
        externalId: key.externalId,
        assetCategory: key.assetCategory,
        name: key.name,
        symbol: key.symbol,
        identifiers: [{ type: "kraken_currency", value: key.rawCode }],
      },
      quantity,
    }));

  const accounts: ConnectorAccount[] = [];
  if (spot.size > 0) {
    accounts.push({
      externalId: "spot",
      name: "Spot",
      baseCurrencyIso: "USD",
      positions: toPositions(spot.values()),
    });
  }
  if (earn.size > 0) {
    accounts.push({
      externalId: "earn",
      name: "Earn",
      baseCurrencyIso: "USD",
      positions: toPositions(earn.values()),
    });
  }
  return accounts;
};

const authenticateWith = <R>(
  credentials: KrakenCredentials,
  client: KrakenClient<R>,
): Effect.Effect<
  {
    readonly fetchAccounts: () => Effect.Effect<
      ReadonlyArray<ConnectorAccount>,
      ConnectorFetchAccountsError,
      R
    >;
  },
  ConnectorAuthenticationError,
  R
> =>
  Effect.gen(function* () {
    // Verifying the key up front surfaces wrong keys and missing "Query Funds"
    // permissions as authentication errors instead of sync failures later.
    const verification = yield* client
      .request({ credentials, path: BALANCE_PATH, schema: KrakenBalanceResponse })
      .pipe(Effect.mapError((cause) => authenticationFailure(cause)));
    yield* ensureAuthSuccess(verification);

    return {
      fetchAccounts: () =>
        Effect.gen(function* () {
          const responses = yield* Effect.all(
            {
              balance: client.request({
                credentials,
                path: BALANCE_PATH,
                schema: KrakenBalanceResponse,
              }),
              allocations: client.request({
                credentials,
                path: EARN_ALLOCATIONS_PATH,
                schema: KrakenEarnAllocationsResponse,
                extraParameters: { hide_zero_allocations: "true" },
              }),
              strategies: client.request({
                credentials,
                path: EARN_STRATEGIES_PATH,
                schema: KrakenEarnStrategiesResponse,
              }),
            },
            { concurrency: 3 },
          ).pipe(Effect.mapError((cause) => fetchFailure(cause)));
          const checked = yield* Effect.all({
            balance: ensureFetchSuccess(responses.balance),
            allocations: ensureFetchSuccess(responses.allocations),
            strategies: ensureFetchSuccess(responses.strategies),
          });
          return yield* Effect.try({
            try: () => buildAccounts(checked.balance, checked.strategies, checked.allocations),
            catch: (cause) => fetchFailure(cause),
          }).pipe(Effect.flatMap(validateConnectorOutput));
        }),
    };
  });

const authenticationFailure = (cause: unknown) =>
  new ConnectorAuthenticationError({
    category: transportErrorCategory(cause, "authentication"),
    message: cause instanceof Error ? cause.message : "Kraken authentication failed",
  });

const fetchFailure = (cause: unknown) =>
  new ConnectorFetchAccountsError({
    category: transportErrorCategory(cause, "fetch"),
    message: cause instanceof Error ? cause.message : "Kraken account fetch failed",
  });

export interface KrakenConnectorOptions<R = HttpClient.HttpClient> {
  readonly transportFactory?: (origin: string) => KrakenHttpTransport<R>;
  readonly now?: () => Date;
  readonly maxAttempts?: number;
}

type KrakenRuntimeOptions<R> = Omit<KrakenConnectorOptions<R>, "transportFactory">;

const createKrakenConnector = <R>(
  options: KrakenRuntimeOptions<R>,
  transportFactory: (origin: string) => KrakenHttpTransport<R>,
): Connector<KrakenCredentials, R> => ({
  id: "kraken",
  name: "Kraken",
  icon: `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`,
  instructions,
  assetCategories: ["crypto"],
  credentialFields: [
    {
      key: "apiKey",
      label: "API key",
      kind: "text",
      required: true,
      helpText: "Create a read-only API key in Kraken.",
    },
    {
      key: "apiSecret",
      label: "API secret",
      kind: "password",
      required: true,
    },
  ],
  credentialsSchema: KrakenCredentials,
  authenticate: (input) =>
    Effect.gen(function* () {
      const credentials = yield* Schema.decodeUnknownEffect(KrakenCredentials)(input).pipe(
        Effect.mapError(() => authenticationFailure(new Error("Kraken credentials are invalid"))),
      );
      const clientOptions = { transport: transportFactory(KRAKEN_REST_ORIGIN) };
      if (options.now !== undefined) Object.assign(clientOptions, { now: options.now });
      if (options.maxAttempts !== undefined)
        Object.assign(clientOptions, { maxAttempts: options.maxAttempts });
      const client = makeKrakenClient(clientOptions);
      return yield* authenticateWith<R>(credentials, client);
    }),
});

export function makeKrakenConnector(): Connector<KrakenCredentials, HttpClient.HttpClient>;
export function makeKrakenConnector<R>(
  options: KrakenConnectorOptions<R>,
): Connector<KrakenCredentials, R>;
export function makeKrakenConnector<R>(
  options: KrakenConnectorOptions<R> = {},
): Connector<KrakenCredentials, R> | Connector<KrakenCredentials, HttpClient.HttpClient> {
  const { transportFactory, ...runtimeOptions } = options;
  if (transportFactory !== undefined) {
    return createKrakenConnector(runtimeOptions, transportFactory);
  }
  return createKrakenConnector(runtimeOptions, (origin) => makeEffectHttpTransport(origin));
}

export const KrakenConnector = makeKrakenConnector();
