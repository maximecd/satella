import * as Duration from "effect/Duration";
import { CONNECTOR_CAPABILITIES as COMPOSED_CONNECTOR_CAPABILITIES } from "./connectors/registry.js";

export const DEFAULT_REPORTING_CURRENCY = "USD" as const;

export const DEFAULT_MARKET_DATA_PROVIDER_BY_ASSET_CATEGORY = {
  stocks_etfs: "yahoo-finance",
  bonds: "manual",
  crypto: "coingecko",
  cash: "yahoo-finance",
  derivatives: "manual",
  commodities: "manual",
  other: "manual",
} as const;

export const DEFAULT_MARKET_DATA_POLICY = {
  priceFreshness: Duration.minutes(5),
  requestTimeout: Duration.seconds(10),
  maxAttempts: 3,
  maxConcurrentBatchesPerProvider: 2,
  searchDebounceMs: 300,
} as const;

export const DEFAULT_SNAPSHOT_INTERVAL = Duration.days(1);

/** Connector capabilities are derived from the explicitly compiled connector registry. */
export const CONNECTOR_CAPABILITIES = COMPOSED_CONNECTOR_CAPABILITIES;
