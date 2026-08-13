import { HttpClient } from "effect/unstable/http";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

import {
  Connector,
  ConnectorAccount,
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  validateConnectorOutput,
} from "@optimus/connector-core";
import {
  makeEffectHttpTransport,
  makeOkxClient,
  okxRestOrigin,
  type OkxHttpTransport,
  type OkxClient,
  OkxTransportError,
} from "./client.js";
import {
  OkxConfigResponse,
  OkxCredentials,
  OkxEarnBalanceResponse,
  OkxFundingBalanceResponse,
  OkxTradingBalanceResponse,
} from "./schemas.js";

const okxIcon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;
const okxInstructions = instructions;

export interface OkxConnectorOptions<R = HttpClient.HttpClient> {
  readonly transportFactory?: (origin: string) => OkxHttpTransport<R>;
  readonly now?: () => Date;
  readonly maxAttempts?: number;
}

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

const connectorAsset = (currency: string) => {
  const assetClass = FIAT_CURRENCIES.has(currency) ? ("fiat" as const) : ("crypto" as const);
  return {
    externalId: `okx:currency:${currency}`,
    assetClass,
    name: currency,
    symbol: currency,
    identifiers: [
      {
        type: assetClass === "fiat" ? "iso_currency" : "okx_currency",
        value: currency,
      },
    ],
  };
};

const normalizeQuantity = (value: string, currency: string): number => {
  if (value.trim() === "") {
    throw new Error(`OKX returned an invalid ${currency} balance`);
  }
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    throw new Error(`OKX returned an invalid ${currency} balance`);
  }
  return quantity;
};

const normalizeCurrency = (value: string): string => {
  const currency = value.trim().toUpperCase();
  if (currency.length === 0 || !/^[A-Z0-9._-]+$/.test(currency)) {
    throw new Error("OKX returned an invalid currency code");
  }
  return currency;
};

const mapBalances = (
  rows: ReadonlyArray<{ readonly ccy: string; readonly amount: string }>,
): ReadonlyArray<{
  readonly asset: ReturnType<typeof connectorAsset>;
  readonly quantity: number;
}> => {
  const quantities = new Map<string, number>();
  for (const row of rows) {
    const currency = normalizeCurrency(row.ccy);
    const quantity = normalizeQuantity(row.amount, currency);
    quantities.set(currency, (quantities.get(currency) ?? 0) + quantity);
  }
  return [...quantities]
    .filter(([, quantity]) => quantity !== 0)
    .map(([currency, quantity]) => ({ asset: connectorAsset(currency), quantity }));
};

const mapErrorCategory = (
  cause: unknown,
  phase: "authentication" | "fetch",
): ConnectorAuthenticationError["category"] | ConnectorFetchAccountsError["category"] => {
  if (cause instanceof OkxTransportError) {
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
};

const authenticationError = (cause: unknown, message?: string) =>
  new ConnectorAuthenticationError({
    category: mapErrorCategory(cause, "authentication") as ConnectorAuthenticationError["category"],
    message: message ?? "OKX authentication failed",
  });

const fetchError = (cause: unknown, message?: string) =>
  new ConnectorFetchAccountsError({
    category: mapErrorCategory(cause, "fetch") as ConnectorFetchAccountsError["category"],
    message: message ?? "OKX account fetch failed",
  });

const apiErrorCategory = (
  code: string,
  phase: "authentication" | "fetch",
): ConnectorAuthenticationError["category"] | ConnectorFetchAccountsError["category"] => {
  if (code === "50011" || code === "50013") return "rate_limit";
  if (code === "50119")
    return phase === "authentication" ? "unsupported_region" : "authentication_expired";
  if (
    code === "50101" ||
    code === "50103" ||
    code === "50104" ||
    code === "50110" ||
    code === "50111"
  ) {
    return phase === "authentication" ? "invalid_credentials" : "authentication_expired";
  }
  if (code === "50105" || code === "50106") {
    return phase === "authentication" ? "insufficient_permission" : "authentication_expired";
  }
  if (code === "50102") return "network";
  return phase === "authentication" ? "invalid_response" : "invalid_response";
};

const ensureAuthenticationSuccess = <A extends { readonly code: string; readonly msg: string }>(
  response: A,
): Effect.Effect<A, ConnectorAuthenticationError> => {
  if (response.code === "0") return Effect.succeed(response);
  return Effect.fail(
    new ConnectorAuthenticationError({
      category: apiErrorCategory(
        response.code,
        "authentication",
      ) as ConnectorAuthenticationError["category"],
      message: "OKX rejected the authenticated request",
    }),
  );
};

const ensureFetchSuccess = <A extends { readonly code: string; readonly msg: string }>(
  response: A,
): Effect.Effect<A, ConnectorFetchAccountsError> => {
  if (response.code === "0") return Effect.succeed(response);
  return Effect.fail(
    new ConnectorFetchAccountsError({
      category: apiErrorCategory(response.code, "fetch") as ConnectorFetchAccountsError["category"],
      message: "OKX rejected the account request",
    }),
  );
};

const buildAccounts = (
  trading: typeof OkxTradingBalanceResponse.Type,
  funding: typeof OkxFundingBalanceResponse.Type,
  earn: typeof OkxEarnBalanceResponse.Type,
): ReadonlyArray<ConnectorAccount> => {
  const tradingPositions = mapBalances(
    trading.data.flatMap(({ details }) =>
      details.map(({ ccy, cashBal }) => ({ ccy, amount: cashBal })),
    ),
  );
  const fundingPositions = mapBalances(funding.data.map(({ ccy, bal }) => ({ ccy, amount: bal })));
  const earnPositions = mapBalances(earn.data.map(({ ccy, amt }) => ({ ccy, amount: amt })));
  return [
    {
      externalId: "trading",
      name: "Trading",
      baseCurrencyIso: "USD",
      accountKind: "crypto",
      positions: tradingPositions,
    },
    {
      externalId: "funding",
      name: "Funding",
      baseCurrencyIso: "USD",
      accountKind: "crypto",
      positions: fundingPositions,
    },
    {
      externalId: "earn",
      name: "Earn",
      baseCurrencyIso: "USD",
      accountKind: "crypto",
      positions: earnPositions,
    },
  ];
};

const authenticateWith = <R>(
  credentials: OkxCredentials,
  client: OkxClient<R>,
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
    const clockOffsetMs = yield* client
      .synchronizeClock()
      .pipe(Effect.mapError((cause) => authenticationError(cause)));
    const config = yield* client
      .request({
        credentials,
        path: "/api/v5/account/config",
        schema: OkxConfigResponse,
        clockOffsetMs,
      })
      .pipe(
        Effect.mapError((cause) => authenticationError(cause)),
        Effect.flatMap((response) => ensureAuthenticationSuccess(response)),
      );
    void config;
    return {
      fetchAccounts: () =>
        Effect.gen(function* () {
          const responses = yield* Effect.all(
            {
              trading: client.request({
                credentials,
                path: "/api/v5/account/balance",
                schema: OkxTradingBalanceResponse,
                clockOffsetMs,
              }),
              funding: client.request({
                credentials,
                path: "/api/v5/asset/balances",
                schema: OkxFundingBalanceResponse,
                clockOffsetMs,
              }),
              earn: client.request({
                credentials,
                path: "/api/v5/finance/savings/balance",
                schema: OkxEarnBalanceResponse,
                clockOffsetMs,
              }),
            },
            { concurrency: 3 },
          ).pipe(
            Effect.mapError((cause) => fetchError(cause)),
            Effect.flatMap(({ trading, funding, earn }) =>
              Effect.all({
                trading: ensureFetchSuccess(trading),
                funding: ensureFetchSuccess(funding),
                earn: ensureFetchSuccess(earn),
              }),
            ),
          );
          return yield* Effect.try({
            try: () => buildAccounts(responses.trading, responses.funding, responses.earn),
            catch: (cause) => fetchError(cause),
          }).pipe(Effect.flatMap(validateConnectorOutput));
        }),
    };
  });

export const makeOkxConnector = <R = HttpClient.HttpClient>(
  options: OkxConnectorOptions<R> = {},
): Connector<OkxCredentials, R> => ({
  id: "okx",
  name: "OKX",
  icon: okxIcon,
  instructions: okxInstructions,
  assetClasses: ["crypto"],
  credentialFields: [
    {
      key: "apiKey",
      label: "API key",
      kind: "text",
      required: true,
      helpText: "Create a read-only API key in OKX.",
    },
    {
      key: "secretKey",
      label: "Secret key",
      kind: "password",
      required: true,
    },
    {
      key: "passphrase",
      label: "Passphrase",
      kind: "password",
      required: true,
    },
    {
      key: "region",
      label: "Region",
      kind: "select",
      required: true,
      options: [
        { value: "global", label: "Global" },
        { value: "eea", label: "European Economic Area" },
        { value: "us", label: "United States" },
      ],
    },
  ],
  credentialsSchema: OkxCredentials,
  authenticate: (input) =>
    Effect.gen(function* () {
      const credentials = yield* Schema.decodeUnknownEffect(OkxCredentials)(input).pipe(
        Effect.mapError(() => authenticationError(undefined, "OKX credentials are invalid")),
      );
      const transport =
        options.transportFactory?.(okxRestOrigin(credentials.region)) ??
        (makeEffectHttpTransport(
          okxRestOrigin(credentials.region),
        ) as unknown as OkxHttpTransport<R>);
      const client = makeOkxClient({
        transport,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
      });
      return yield* authenticateWith<R>(credentials, client);
    }),
});

export const OkxConnector = makeOkxConnector();
