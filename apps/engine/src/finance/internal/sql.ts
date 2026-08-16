import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";

import type { AssetCategory } from "../contracts.js";
import { FinanceApiError as FinanceError } from "../contracts.js";
import {
  canonicalDecimal,
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  type DecimalInput,
} from "../financial-number.js";
import {
  DEFAULT_MARKET_DATA_POLICY,
  DEFAULT_REPORTING_CURRENCY,
  SUPPORTED_REPORTING_CURRENCIES,
} from "../config.js";

export type FinanceEffect<A> = Effect.Effect<A, FinanceError, SqlClient.SqlClient>;

export const MANUAL_ASSET_CATEGORIES = new Set<AssetCategory>(["bonds", "other"]);

export interface AssetRow {
  readonly id: string;
  readonly asset_category: AssetCategory;
  readonly name: string;
  readonly symbol: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface IdentifierRow {
  readonly identifier_type: string;
  readonly identifier_value: string;
}

export interface PriceRow {
  readonly price: string;
  readonly currency_asset_id: string;
  readonly currency_iso: string;
  readonly source: string;
  readonly observed_at: string;
  readonly updated_at: string;
}

export interface ConnectionRow {
  readonly id: string;
  readonly name: string;
  readonly connector_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AccountSummaryRow {
  readonly id: string;
  readonly name: string;
  readonly base_currency_iso: string;
  readonly connector_account_id: string | null;
  readonly position_count: number;
}

export interface AccountRow {
  readonly id: string;
  readonly connection_id: string | null;
  readonly connection_name: string | null;
  readonly name: string;
  readonly base_currency_asset_id: string;
  readonly base_currency_iso: string;
  readonly connector_account_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PositionRow {
  readonly id: string;
  readonly account_id: string;
  readonly asset_id: string;
  readonly asset_name: string;
  readonly asset_symbol: string | null;
  readonly asset_category: AssetCategory;
  readonly quantity: string;
  readonly price: string | null;
  readonly currency_asset_id: string | null;
  readonly currency_iso: string | null;
  readonly source: string | null;
  readonly observed_at: string | null;
  readonly price_updated_at: string | null;
  readonly manual_average_unit_purchase_price: string | null;
  readonly manual_purchase_currency_asset_id: string | null;
  readonly manual_purchase_currency_iso: string | null;
  readonly connection_average_unit_purchase_price: string | null;
  readonly connection_purchase_currency_asset_id: string | null;
  readonly connection_purchase_currency_iso: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const nowIso = () => new Date().toISOString();

export const isStalePrice = (observedAt: string) =>
  Date.parse(observedAt) <
  Date.now() - Duration.toMillis(DEFAULT_MARKET_DATA_POLICY.priceFreshness);

export const failure = (code: FinanceError["code"], message: string) =>
  new FinanceError({ code, message });

export const databaseFailure = (cause: unknown) => {
  const text = cause instanceof Error ? cause.message : String(cause);
  return failure(
    text.includes("UNIQUE") || text.includes("FOREIGN KEY") ? "conflict" : "database",
    text.includes("UNIQUE") || text.includes("FOREIGN KEY")
      ? "The requested change conflicts with existing finance data"
      : "The finance database operation failed",
  );
};

export const db = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(databaseFailure),
    Effect.catchDefect((cause) => Effect.fail(databaseFailure(cause))),
  );

export const requireFinite = (value: DecimalInput, field: string) =>
  Effect.try({
    try: () => canonicalDecimal(value),
    catch: () => failure("validation", `${field} must be a finite decimal`),
  });

export const requirePositive = (value: DecimalInput, field: string) =>
  requireFinite(value, field).pipe(
    Effect.filterOrFail(
      (decimal) => compareDecimal(decimal, "0") > 0,
      () => failure("validation", `${field} must be greater than zero`),
    ),
  );

export const requireNonEmpty = (value: string, field: string) => {
  const result = value.trim();
  return result.length > 0
    ? Effect.succeed(result)
    : Effect.fail(failure("validation", `${field} is required`));
};

export const firstOrNotFound = <A>(rows: ReadonlyArray<A>, entity: string) =>
  rows[0] === undefined
    ? Effect.fail(failure("not_found", `${entity} was not found`))
    : Effect.succeed(rows[0]);

export const assertCash = (assetId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{
        readonly asset_category: string;
      }>`SELECT asset_category FROM assets WHERE id = ${assetId}`,
    );
    const row = yield* firstOrNotFound(rows, "Currency asset");
    if (row.asset_category !== "cash") {
      return yield* Effect.fail(
        failure("validation", "Account and price currencies must be cash assets"),
      );
    }
  });

export const usdAssetId = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* db(sql<{ readonly asset_id: string }>`SELECT asset_id FROM asset_identifiers
    WHERE identifier_type = 'iso_currency' AND identifier_value = ${DEFAULT_REPORTING_CURRENCY}`);
  return (yield* firstOrNotFound(rows, "FX pivot currency")).asset_id;
});

export const reportingCurrency = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* db(sql<{
    readonly asset_id: string;
    readonly iso: string;
  }>`SELECT a.id AS asset_id, COALESCE(ai.identifier_value, a.symbol, a.name) AS iso
    FROM app_settings s
    JOIN assets a ON a.id = s.reporting_currency_asset_id
    LEFT JOIN asset_identifiers ai ON ai.asset_id = a.id AND ai.identifier_type = 'iso_currency'
    WHERE s.id = 1`);
  const row = yield* firstOrNotFound(rows, "Reporting currency");
  return { assetId: row.asset_id, iso: row.iso };
});

export const loadFxMap = (pivotAssetId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const fxRows = yield* db(
      sql<{
        readonly asset_id: string;
        readonly price: string;
      }>`SELECT asset_id, price FROM asset_prices WHERE currency_asset_id = ${pivotAssetId}`,
    );
    return new Map(fxRows.map(({ asset_id, price }) => [asset_id, price] as const));
  });

export const convertAmount = (
  amount: DecimalInput,
  fromCurrencyId: string,
  toCurrencyId: string,
  pivotId: string,
  fx: ReadonlyMap<string, string>,
): string | undefined => {
  if (fromCurrencyId === toCurrencyId) return canonicalDecimal(amount);
  const fromRate = fromCurrencyId === pivotId ? "1" : fx.get(fromCurrencyId);
  const toRate = toCurrencyId === pivotId ? "1" : fx.get(toCurrencyId);
  if (fromRate === undefined || toRate === undefined) return undefined;
  return divideDecimal(multiplyDecimal(amount, fromRate), toRate);
};

export const isSupportedReportingCurrency = (iso: string) =>
  (SUPPORTED_REPORTING_CURRENCIES as readonly string[]).includes(iso);

export const loadPrice = (assetId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<PriceRow>`SELECT ap.price, ap.currency_asset_id,
        COALESCE(identifier.identifier_value, currency.symbol, currency.name) AS currency_iso,
        ap.source, ap.observed_at, ap.updated_at
      FROM asset_prices ap
      JOIN assets currency ON currency.id = ap.currency_asset_id
      LEFT JOIN asset_identifiers identifier ON identifier.asset_id = currency.id
        AND identifier.identifier_type = 'iso_currency'
      WHERE ap.asset_id = ${assetId}`);
    const row = rows[0];
    return row === undefined
      ? null
      : {
          price: canonicalDecimal(row.price),
          currencyAssetId: row.currency_asset_id,
          currencyIso: row.currency_iso,
          source: row.source,
          observedAt: row.observed_at,
          updatedAt: row.updated_at,
          isStale: isStalePrice(row.observed_at),
        };
  });
