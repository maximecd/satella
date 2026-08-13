import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type {
  Account,
  CreateAccountInput,
  Position,
  PresentationRole,
  UpdateAccountInput,
} from "../contracts.js";
import { getCustodian } from "../custodians/CustodianSql.js";
import {
  assertFiat,
  db,
  failure,
  firstOrNotFound,
  isStalePrice,
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
      yield* db(sql<{
        readonly management_mode: string;
        readonly presentation_role: PresentationRole | null;
      }>`SELECT c.management_mode, a.presentation_role
        FROM accounts a JOIN custodians c ON c.id = a.custodian_id WHERE a.id = ${accountId}`),
      "Account",
    );
    if (row.management_mode !== "manual") {
      return yield* Effect.fail(
        failure("read_only", "Connector-managed accounts and positions are read-only"),
      );
    }
    if (row.presentation_role !== null) {
      return yield* Effect.fail(
        failure(
          "read_only",
          "System-managed accounts cannot be changed through ordinary workflows",
        ),
      );
    }
  });

export const loadPosition = (
  row: PositionRow,
  valuationCurrencyId: string,
  reportingCurrencyId: string,
  fx: ReadonlyMap<string, number>,
): Position => {
  const implicitFiatPrice =
    row.asset_class === "fiat" &&
    (row.asset_id === valuationCurrencyId || row.asset_id === reportingCurrencyId)
      ? 1
      : null;
  const selectedPrice = row.price ?? implicitFiatPrice;
  const currencyId =
    row.currency_asset_id ??
    (implicitFiatPrice === null
      ? null
      : row.asset_id === valuationCurrencyId
        ? valuationCurrencyId
        : reportingCurrencyId);
  const currencyRate =
    currencyId === reportingCurrencyId ? 1 : currencyId === null ? undefined : fx.get(currencyId);
  const valuationRate =
    valuationCurrencyId === reportingCurrencyId ? 1 : fx.get(valuationCurrencyId);
  const conversion =
    currencyId === valuationCurrencyId
      ? 1
      : currencyRate === undefined || valuationRate === undefined
        ? undefined
        : currencyRate / valuationRate;
  const reportingValue =
    selectedPrice === null || conversion === undefined
      ? null
      : row.quantity * selectedPrice * conversion;
  return {
    id: row.id,
    accountId: row.account_id,
    assetId: row.asset_id,
    assetName: row.asset_name,
    assetSymbol: row.asset_symbol,
    assetClass: row.asset_class,
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

export const getAccount = (id: string): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const account = yield* firstOrNotFound(
      yield* db(sql<AccountRow>`SELECT a.id, a.custodian_id, c.name AS custodian_name,
        c.management_mode, a.presentation_role, a.name, a.account_kind, a.base_currency_asset_id,
        COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
        a.connector_account_id, a.created_at, a.updated_at
        FROM accounts a JOIN custodians c ON c.id = a.custodian_id
        JOIN assets ba ON ba.id = a.base_currency_asset_id
        LEFT JOIN asset_identifiers ai ON ai.asset_id = ba.id AND ai.identifier_type = 'iso_currency'
        WHERE a.id = ${id}`),
      "Account",
    );
    const rows = yield* db(sql<PositionRow>`SELECT p.id, p.account_id, p.asset_id,
      a.name AS asset_name, a.symbol AS asset_symbol, a.asset_class, p.quantity,
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
    const reportingCurrencyId = yield* usdAssetId;
    const fxRows = yield* db(sql<{
      readonly asset_id: string;
      readonly price: number;
    }>`SELECT asset_id, price
      FROM asset_prices WHERE currency_asset_id = ${reportingCurrencyId}`);
    const fx = new Map(fxRows.map(({ asset_id, price }) => [asset_id, price] as const));
    const positions = rows.map((row) =>
      loadPosition(row, account.base_currency_asset_id, reportingCurrencyId, fx),
    );
    return {
      id: account.id,
      custodianId: account.custodian_id,
      custodianName: account.custodian_name,
      managementMode: account.management_mode,
      presentationRole: account.presentation_role,
      name: account.name,
      accountKind: account.account_kind,
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
    const custodian = yield* getCustodian(input.custodianId);
    if (custodian.managementMode !== "manual") {
      return yield* Effect.fail(failure("read_only", "Connector-managed custodians are read-only"));
    }
    if (custodian.presentationRole !== null) {
      return yield* Effect.fail(
        failure("read_only", "System-managed custodians cannot receive manual accounts"),
      );
    }
    const name = yield* requireNonEmpty(input.name, "Account name");
    const accountKind = input.accountKind ?? "other";
    const currencyId = input.baseCurrencyAssetId ?? (yield* usdAssetId);
    yield* assertFiat(currencyId);
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO accounts
      (id, custodian_id, name, account_kind, base_currency_asset_id, connector_account_id, created_at, updated_at)
      VALUES (${id}, ${input.custodianId}, ${name}, ${accountKind}, ${currencyId}, NULL, ${timestamp}, ${timestamp})`);
    return yield* getAccount(id);
  });

export const updateAccount = (id: string, input: UpdateAccountInput): FinanceEffect<Account> =>
  Effect.gen(function* () {
    yield* assertManualAccountOwner(id);
    yield* assertFiat(input.baseCurrencyAssetId);
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
