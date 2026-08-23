import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type {
  Account,
  AccountType,
  CreateAccountInput,
  Position,
  UpdateAccountInput,
} from "../contracts.js";
import { DEFAULT_MANUAL_ACCOUNT_ID, DEFAULT_MANUAL_CUSTODIAN_ID } from "../config.js";
import {
  addDecimal,
  canonicalDecimal,
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
} from "../financial-number.js";
import {
  assertCash,
  convertAmount,
  db,
  failure,
  firstOrNotFound,
  loadFxMap,
  nowIso,
  requireNonEmpty,
  usdAssetId,
  type AccountRow,
  type FinanceEffect,
  type PositionRow,
} from "../internal/sql.js";

const CASH_ACCOUNT_TYPES = new Set<AccountType>(["checking", "savings"]);

export const isCashAccountType = (accountType: AccountType) => CASH_ACCOUNT_TYPES.has(accountType);

export const assertManualAccountOwner = (accountId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(
        sql<{
          readonly connector_id: string | null;
        }>`SELECT c.connector_id FROM accounts a
          JOIN custodians c ON c.id = a.custodian_id WHERE a.id = ${accountId}`,
      ),
      "Account",
    );
    if (row.connector_id !== null) {
      return yield* Effect.fail(
        failure("read_only", "Accounts under synced custodians are read-only"),
      );
    }
  });

export const assertAccountAcceptsAsset = (
  account: Account,
  assetCategory: string,
  assetId: string,
) =>
  Effect.gen(function* () {
    if (!isCashAccountType(account.accountType)) return;
    if (assetCategory !== "cash") {
      return yield* Effect.fail(
        failure("validation", "Checking and savings accounts can only hold cash"),
      );
    }
    const otherCurrency = account.positions.find(
      (position) => position.assetCategory === "cash" && position.assetId !== assetId,
    );
    if (otherCurrency !== undefined || assetId !== account.baseCurrencyAssetId) {
      return yield* Effect.fail(
        failure("validation", "Checking and savings accounts hold exactly one currency"),
      );
    }
  });

export const loadPosition = (
  row: PositionRow,
  valuationCurrencyId: string,
  fxPivotId: string,
  fx: ReadonlyMap<string, string>,
): Position => {
  const cashConversion =
    row.asset_category === "cash"
      ? convertAmount(row.quantity, row.asset_id, valuationCurrencyId, fxPivotId, fx)
      : undefined;
  const selectedPrice = row.price;
  const conversion =
    row.currency_asset_id === null
      ? undefined
      : convertAmount("1", row.currency_asset_id, valuationCurrencyId, fxPivotId, fx);
  const reportingValue =
    row.asset_category === "cash"
      ? (cashConversion ?? null)
      : selectedPrice === null || conversion === undefined
        ? null
        : multiplyDecimal(multiplyDecimal(row.quantity, selectedPrice), conversion);
  const averagePurchase =
    row.asset_category === "cash"
      ? null
      : row.manual_average_unit_purchase_price !== null &&
          row.manual_purchase_currency_asset_id !== null &&
          row.manual_purchase_currency_iso !== null
        ? {
            price: canonicalDecimal(row.manual_average_unit_purchase_price),
            currencyAssetId: row.manual_purchase_currency_asset_id,
            currencyIso: row.manual_purchase_currency_iso,
            source: "manual" as const,
          }
        : row.synced_average_unit_purchase_price !== null &&
            row.synced_purchase_currency_asset_id !== null &&
            row.synced_purchase_currency_iso !== null
          ? {
              price: canonicalDecimal(row.synced_average_unit_purchase_price),
              currencyAssetId: row.synced_purchase_currency_asset_id,
              currencyIso: row.synced_purchase_currency_iso,
              source: "synced" as const,
            }
          : null;
  const acquisitionCost =
    averagePurchase === null ? null : multiplyDecimal(row.quantity, averagePurchase.price);
  let unrealizedPnl: string | null = null;
  let unrealizedPnlPercent: string | null = null;
  if (
    row.asset_category !== "cash" &&
    compareDecimal(row.quantity, "0") > 0 &&
    averagePurchase !== null &&
    compareDecimal(averagePurchase.price, "0") > 0 &&
    selectedPrice !== null &&
    conversion !== undefined &&
    acquisitionCost !== null
  ) {
    const currentValueInPurchaseCurrency = convertAmount(
      multiplyDecimal(row.quantity, selectedPrice),
      row.currency_asset_id!,
      averagePurchase.currencyAssetId,
      fxPivotId,
      fx,
    );
    const pnlInPurchaseCurrency =
      currentValueInPurchaseCurrency === undefined
        ? undefined
        : subtractDecimal(currentValueInPurchaseCurrency, acquisitionCost);
    const pnlInReportingCurrency =
      pnlInPurchaseCurrency === undefined
        ? undefined
        : convertAmount(
            pnlInPurchaseCurrency,
            averagePurchase.currencyAssetId,
            valuationCurrencyId,
            fxPivotId,
            fx,
          );
    if (pnlInPurchaseCurrency !== undefined && pnlInReportingCurrency !== undefined) {
      unrealizedPnl = pnlInReportingCurrency;
      unrealizedPnlPercent =
        compareDecimal(acquisitionCost, "0") === 0
          ? null
          : divideDecimal(pnlInPurchaseCurrency, acquisitionCost);
    }
  }
  return {
    id: row.id,
    accountId: row.account_id,
    assetId: row.asset_id,
    assetName: row.asset_name,
    assetSymbol: row.asset_symbol,
    assetCategory: row.asset_category,
    quantity: canonicalDecimal(row.quantity),
    price:
      row.price === null ||
      row.currency_asset_id === null ||
      row.currency_iso === null ||
      row.source === null ||
      row.observed_at === null ||
      row.price_updated_at === null
        ? null
        : {
            price: canonicalDecimal(row.price),
            currencyAssetId: row.currency_asset_id,
            currencyIso: row.currency_iso,
            source: row.source,
            observedAt: row.observed_at,
            updatedAt: row.price_updated_at,
          },
    reportingValue,
    averageUnitPurchasePrice: averagePurchase,
    acquisitionCost,
    unrealizedPnl,
    unrealizedPnlPercent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const getAccount = (id: string, valuationCurrencyAssetId?: string): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const account = yield* firstOrNotFound(
      yield* db(sql<AccountRow>`SELECT a.id, a.custodian_id, c.name AS custodian_name,
        c.connector_id AS custodian_connector_id, a.account_type, a.name, a.base_currency_asset_id,
        COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
        a.connector_account_id, a.created_at, a.updated_at
        FROM accounts a
        JOIN custodians c ON c.id = a.custodian_id
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
      ap.updated_at AS price_updated_at,
      p.manual_average_unit_purchase_price,
      p.manual_purchase_currency_asset_id,
      COALESCE(manual_purchase_identifier.identifier_value, manual_purchase_currency.symbol,
        manual_purchase_currency.name) AS manual_purchase_currency_iso,
      p.synced_average_unit_purchase_price,
      p.synced_purchase_currency_asset_id,
      COALESCE(synced_purchase_identifier.identifier_value, synced_purchase_currency.symbol,
        synced_purchase_currency.name) AS synced_purchase_currency_iso,
      p.created_at, p.updated_at
      FROM positions p JOIN assets a ON a.id = p.asset_id
      LEFT JOIN asset_prices ap ON ap.asset_id = a.id
      LEFT JOIN assets price_currency ON price_currency.id = ap.currency_asset_id
      LEFT JOIN asset_identifiers price_identifier ON price_identifier.asset_id = price_currency.id
        AND price_identifier.identifier_type = 'iso_currency'
      LEFT JOIN assets manual_purchase_currency
        ON manual_purchase_currency.id = p.manual_purchase_currency_asset_id
      LEFT JOIN asset_identifiers manual_purchase_identifier
        ON manual_purchase_identifier.asset_id = manual_purchase_currency.id
        AND manual_purchase_identifier.identifier_type = 'iso_currency'
      LEFT JOIN assets synced_purchase_currency
        ON synced_purchase_currency.id = p.synced_purchase_currency_asset_id
      LEFT JOIN asset_identifiers synced_purchase_identifier
        ON synced_purchase_identifier.asset_id = synced_purchase_currency.id
        AND synced_purchase_identifier.identifier_type = 'iso_currency'
      WHERE p.account_id = ${id} ORDER BY a.name, p.id`);
    const fxPivotId = yield* usdAssetId;
    const fx = yield* loadFxMap(fxPivotId);
    const targetCurrencyId = valuationCurrencyAssetId ?? account.base_currency_asset_id;
    const positions = rows.map((row) => loadPosition(row, targetCurrencyId, fxPivotId, fx));
    let total = "0";
    let unrealizedPnl = "0";
    let acquisitionCostInReportingCurrency = "0";
    for (const position of positions) {
      if (position.reportingValue !== null) total = addDecimal(total, position.reportingValue);
      if (position.unrealizedPnl === null || position.acquisitionCost === null) continue;
      const purchaseCurrency = position.averageUnitPurchasePrice?.currencyAssetId;
      if (purchaseCurrency === undefined) continue;
      const acquisitionCost = convertAmount(
        position.acquisitionCost,
        purchaseCurrency,
        targetCurrencyId,
        fxPivotId,
        fx,
      );
      if (acquisitionCost === undefined) continue;
      unrealizedPnl = addDecimal(unrealizedPnl, position.unrealizedPnl);
      acquisitionCostInReportingCurrency = addDecimal(
        acquisitionCostInReportingCurrency,
        acquisitionCost,
      );
    }
    return {
      id: account.id,
      custodianId: account.custodian_id,
      custodianName: account.custodian_name,
      isDefaultCustodian: account.custodian_id === DEFAULT_MANUAL_CUSTODIAN_ID,
      accountType: account.account_type,
      name: account.name,
      baseCurrencyAssetId: account.base_currency_asset_id,
      baseCurrencyIso: account.base_currency_iso,
      connectorAccountId: account.connector_account_id,
      positions,
      total,
      unrealizedPnl,
      unrealizedPnlPercent:
        compareDecimal(acquisitionCostInReportingCurrency, "0") === 0
          ? null
          : divideDecimal(unrealizedPnl, acquisitionCostInReportingCurrency),
      totalIncomplete: positions.some((position) => position.reportingValue === null),
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
    const custodian = yield* firstOrNotFound(
      yield* db(
        sql<{
          readonly id: string;
          readonly connector_id: string | null;
        }>`SELECT id, connector_id FROM custodians WHERE id = ${input.custodianId}`,
      ),
      "Custodian",
    );
    if (custodian.connector_id !== null) {
      return yield* Effect.fail(
        failure("read_only", "Accounts under synced custodians are read-only"),
      );
    }
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO accounts
      (id, custodian_id, name, account_type, base_currency_asset_id, connector_account_id, created_at, updated_at)
      VALUES (${id}, ${input.custodianId}, ${name}, ${input.accountType}, ${currencyId}, NULL, ${timestamp}, ${timestamp})`);
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
    if (id === DEFAULT_MANUAL_ACCOUNT_ID) {
      return yield* Effect.fail(
        failure("validation", "The default manual account cannot be deleted"),
      );
    }
    yield* assertManualAccountOwner(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM accounts WHERE id = ${id}`);
  });
