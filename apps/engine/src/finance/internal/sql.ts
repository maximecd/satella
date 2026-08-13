import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";

import type { AccountKind, AssetClass, PresentationRole } from "../contracts.js";
import { FinanceApiError as FinanceError } from "../contracts.js";
import { DEFAULT_MARKET_DATA_POLICY, DEFAULT_REPORTING_CURRENCY } from "../config.js";

export type FinanceEffect<A> = Effect.Effect<A, FinanceError, SqlClient.SqlClient>;

export interface AssetRow {
  readonly id: string;
  readonly asset_class: AssetClass;
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
  readonly price: number;
  readonly currency_asset_id: string;
  readonly currency_iso: string;
  readonly source: string;
  readonly observed_at: string;
  readonly updated_at: string;
}

export interface CustodianRow {
  readonly id: string;
  readonly name: string;
  readonly management_mode: "manual" | "synced";
  readonly presentation_role: PresentationRole | null;
  readonly connector_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AccountSummaryRow {
  readonly id: string;
  readonly name: string;
  readonly account_kind: AccountKind;
  readonly base_currency_iso: string;
  readonly connector_account_id: string | null;
  readonly position_count: number;
}

export interface AccountRow {
  readonly id: string;
  readonly custodian_id: string;
  readonly custodian_name: string;
  readonly management_mode: "manual" | "synced";
  readonly presentation_role: PresentationRole | null;
  readonly name: string;
  readonly account_kind: AccountKind;
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
  readonly asset_class: AssetClass;
  readonly quantity: number;
  readonly price: number | null;
  readonly currency_asset_id: string | null;
  readonly currency_iso: string | null;
  readonly source: string | null;
  readonly observed_at: string | null;
  readonly price_updated_at: string | null;
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

export const requireFinite = (value: number, field: string) =>
  Number.isFinite(value)
    ? Effect.succeed(value)
    : Effect.fail(failure("validation", `${field} must be finite`));

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

export const assertFiat = (assetId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly asset_class: string }>`SELECT asset_class FROM assets WHERE id = ${assetId}`,
    );
    const row = yield* firstOrNotFound(rows, "Currency asset");
    if (row.asset_class !== "fiat") {
      return yield* Effect.fail(
        failure("validation", "Account and price currencies must be fiat assets"),
      );
    }
  });

export const usdAssetId = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* db(sql<{ readonly asset_id: string }>`SELECT asset_id FROM asset_identifiers
    WHERE identifier_type = 'iso_currency' AND identifier_value = ${DEFAULT_REPORTING_CURRENCY}`);
  return (yield* firstOrNotFound(rows, "Reporting currency")).asset_id;
});

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
          price: row.price,
          currencyAssetId: row.currency_asset_id,
          currencyIso: row.currency_iso,
          source: row.source,
          observedAt: row.observed_at,
          updatedAt: row.updated_at,
          isStale: isStalePrice(row.observed_at),
        };
  });
