import * as Duration from "effect/Duration";
import { CONNECTOR_CAPABILITIES as COMPOSED_CONNECTOR_CAPABILITIES } from "./connectors/registry.js";

export const DEFAULT_REPORTING_CURRENCY = "USD" as const;

export const SUPPORTED_REPORTING_CURRENCIES = [
  "USD",
  "EUR",
  "JPY",
  "GBP",
  "AUD",
  "CAD",
  "CHF",
  "CNH",
  "HKD",
  "NZD",
] as const;
export type SupportedReportingCurrency = (typeof SUPPORTED_REPORTING_CURRENCIES)[number];

export const DEFAULT_MANUAL_CUSTODIAN_ID = "custodian:manual";
export const DEFAULT_MANUAL_ACCOUNT_ID = "account:manual";

export const DEFAULT_MARKET_DATA_PROVIDER_BY_ASSET_CATEGORY = {
  stocks_etfs: "yahoo-finance",
  crypto: "coingecko",
  cash: "yahoo-finance",
  other: "manual",
} as const;

export const DEFAULT_MARKET_DATA_POLICY = {
  priceFreshness: Duration.minutes(5),
  requestTimeout: Duration.seconds(10),
  maxAttempts: 3,
  maxConcurrentBatchesPerProvider: 2,
  searchDebounceMs: 300,
} as const;

export const AUTO_REFRESH_INTERVAL = Duration.minutes(15);

/** Connector capabilities are derived from the explicitly compiled connector registry. */
export const CONNECTOR_CAPABILITIES = COMPOSED_CONNECTOR_CAPABILITIES;
