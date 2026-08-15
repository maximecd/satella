import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type { Account, CreateAccountInput, Position, UpdateAccountInput } from "../contracts.js";
import {
  assertCash,
  convertAmount,
  db,
  failure,
  firstOrNotFound,
  isStalePrice,
  loadFxMap,
  nowIso,
  requireNonEmpty,
  usdAssetId,
  type AccountRow,
  type FinanceEffect,
  type PositionRow,
} from "../internal/sql.js";

export const assertManualAccountOwner = (accountId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(
        sql<{
          readonly connection_id: string | null;
        }>`SELECT connection_id FROM accounts WHERE id = ${accountId}`,
      ),
      "Account",
    );
    if (row.connection_id !== null) {
      return yield* Effect.fail(
        failure("read_only", "Connector-managed accounts and positions are read-only"),
      );
    }
  });

export const loadPosition = (
  row: PositionRow,
  valuationCurrencyId: string,
  fxPivotId: string,
  fx: ReadonlyMap<string, number>,
): Position => {
  const cashConversion =
    row.asset_category === "cash"
      ? convertAmount(row.quantity, row.asset_id, valuationCurrencyId, fxPivotId, fx)
      : undefined;
  const selectedPrice = row.price;
  const conversion =
    row.currency_asset_id === null
      ? undefined
      : convertAmount(1, row.currency_asset_id, valuationCurrencyId, fxPivotId, fx);
  const reportingValue =
    row.asset_category === "cash"
      ? (cashConversion ?? null)
      : selectedPrice === null || conversion === undefined
        ? null
        : row.quantity * selectedPrice * conversion;
  return {
    id: row.id,
    accountId: row.account_id,
    assetId: row.asset_id,
    assetName: row.asset_name,
    assetSymbol: row.asset_symbol,
    assetCategory: row.asset_category,
    quantity: row.quantity,
    price:
      row.price === null ||
      row.currency_asset_id === null ||
      row.currency_iso === null ||
      row.source === null ||
      row.observed_at === null ||
      row.price_updated_at === null
        ? null
        : {
            price: row.price,
            currencyAssetId: row.currency_asset_id,
            currencyIso: row.currency_iso,
            source: row.source,
            observedAt: row.observed_at,
            updatedAt: row.price_updated_at,
            isStale: isStalePrice(row.observed_at),
          },
    reportingValue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const getAccount = (id: string, valuationCurrencyAssetId?: string): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const account = yield* firstOrNotFound(
      yield* db(sql<AccountRow>`SELECT a.id, a.connection_id, c.name AS connection_name,
        a.name, a.base_currency_asset_id,
        COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
        a.connector_account_id, a.created_at, a.updated_at
        FROM accounts a
        LEFT JOIN connections c ON c.id = a.connection_id
        JOIN assets ba ON ba.id = a.base_currency_asset_id
        LEFT JOIN asset_identifiers ai ON ai.asset_id = ba.id AND ai.identifier_type = 'iso_currency'
        WHERE a.id = ${id}`),
      "Account",
    );
    const rows = yield* db(sql<PositionRow>`SELECT p.id, p.account_id, p.asset_id,
      a.name AS asset_name, a.symbol AS asset_symbol, a.asset_category, p.quantity,
      ap.price, ap.currency_asset_id,
      COALESCE(price_identifier.identifier_value, price_currency.symbol, price_currency.name)
        AS currency_iso,
      ap.source, ap.observed_at,
      ap.updated_at AS price_updated_at, p.created_at, p.updated_at
      FROM positions p JOIN assets a ON a.id = p.asset_id
      LEFT JOIN asset_prices ap ON ap.asset_id = a.id
      LEFT JOIN assets price_currency ON price_currency.id = ap.currency_asset_id
      LEFT JOIN asset_identifiers price_identifier ON price_identifier.asset_id = price_currency.id
        AND price_identifier.identifier_type = 'iso_currency'
      WHERE p.account_id = ${id} ORDER BY a.name, p.id`);
    const fxPivotId = yield* usdAssetId;
    const fx = yield* loadFxMap(fxPivotId);
    const targetCurrencyId = valuationCurrencyAssetId ?? account.base_currency_asset_id;
    const positions = rows.map((row) => loadPosition(row, targetCurrencyId, fxPivotId, fx));
    return {
      id: account.id,
      connectionId: account.connection_id,
      connectionName: account.connection_name,
      name: account.name,
      baseCurrencyAssetId: account.base_currency_asset_id,
      baseCurrencyIso: account.base_currency_iso,
      connectorAccountId: account.connector_account_id,
      positions,
      total: positions.reduce((sum, position) => sum + (position.reportingValue ?? 0), 0),
      totalIncomplete: positions.some((position) => position.reportingValue === null),
      hasStalePrices: positions.some((position) => position.price?.isStale === true),
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
  });

export const createAccount = (input: CreateAccountInput): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const name = yield* requireNonEmpty(input.name, "Account name");
    const currencyId = input.baseCurrencyAssetId ?? (yield* usdAssetId);
    yield* assertCash(currencyId);
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO accounts
      (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
      VALUES (${id}, NULL, ${name}, ${currencyId}, NULL, ${timestamp}, ${timestamp})`);
    return yield* getAccount(id);
  });

export const updateAccount = (id: string, input: UpdateAccountInput): FinanceEffect<Account> =>
  Effect.gen(function* () {
    yield* assertManualAccountOwner(id);
    yield* assertCash(input.baseCurrencyAssetId);
    const name = yield* requireNonEmpty(input.name, "Account name");
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`UPDATE accounts SET name = ${name}, base_currency_asset_id = ${input.baseCurrencyAssetId},
      updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* getAccount(id);
  });

export const deleteAccount = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* assertManualAccountOwner(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM accounts WHERE id = ${id}`);
  });
