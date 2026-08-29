import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type {
  AllocationCell,
  Account,
  AssetCategory,
  Dashboard,
  DashboardAccountRow,
  DashboardCustodianGroup,
  PortfolioHistoryPoint,
  ReportingCurrency,
  SnapshotResult,
} from "../contracts.js";
import { ASSET_CATEGORY_LABELS } from "../contracts.js";
import { getAccount } from "../accounts/AccountSql.js";
import { refreshPrices, type MarketDataRegistry } from "../market-data.js";
import {
  addDecimal,
  canonicalDecimal,
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
} from "../financial-number.js";
import {
  convertAmount,
  db,
  loadFxMap,
  reportingCurrency,
  usdAssetId,
  type FinanceEffect,
} from "../internal/sql.js";

export interface CaptureSnapshotOptions {
  readonly refresh?: boolean;
  readonly requireFresh?: boolean;
  readonly registry?: MarketDataRegistry;
  readonly now?: () => Date;
}

/** Sum of all outstanding debts converted into the Reporting currency; `incomplete` flags debts without an FX rate. */
const sumDebtsIn = (
  selected: ReportingCurrency,
  fxPivotId: string,
  fx: ReadonlyMap<string, string>,
): FinanceEffect<{ readonly total: string; readonly incomplete: boolean }> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const debtRows = yield* db(
      sql<{
        readonly amount: string;
        readonly currency_asset_id: string;
      }>`SELECT amount, currency_asset_id FROM debts`,
    );
    let total = "0";
    let incomplete = false;
    for (const row of debtRows) {
      const converted = convertAmount(
        row.amount,
        row.currency_asset_id,
        selected.assetId,
        fxPivotId,
        fx,
      );
      if (converted === undefined) {
        incomplete = true;
        continue;
      }
      total = addDecimal(total, converted);
    }
    return { total, incomplete };
  });

export const captureSnapshot = (
  options: CaptureSnapshotOptions = {},
): FinanceEffect<SnapshotResult> =>
  Effect.gen(function* () {
    if (options.refresh !== false) {
      const refreshOptions = {
        requireFresh: options.requireFresh === true,
        includeAllCashFx: true,
      };
      if (options.registry !== undefined)
        Object.assign(refreshOptions, { registry: options.registry });
      if (options.now !== undefined) Object.assign(refreshOptions, { now: options.now });
      yield* refreshPrices(refreshOptions);
    }
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const capturedAt = (options.now ?? (() => new Date()))().toISOString();
    const selected = yield* reportingCurrency;
    const fxPivotId = yield* usdAssetId;
    const fx = yield* loadFxMap(fxPivotId);
    const { total: totalDebt } = yield* sumDebtsIn(selected, fxPivotId, fx);
    const result = yield* db(
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO snapshots (id, captured_at, total_debt) VALUES (${id}, ${capturedAt}, ${totalDebt})`;
          yield* sql`INSERT INTO position_snapshots (snapshot_id, position_id, quantity)
            SELECT ${id}, id, quantity FROM positions`;
          yield* sql`INSERT INTO asset_price_snapshots
            (snapshot_id, asset_id, price, currency_asset_id, source, observed_at)
            SELECT ${id}, ap.asset_id, ap.price, ap.currency_asset_id, ap.source, ap.observed_at
            FROM asset_prices ap
            WHERE EXISTS (SELECT 1 FROM positions p WHERE p.asset_id = ap.asset_id)
               OR EXISTS (
                 SELECT 1 FROM asset_identifiers ai
                 JOIN assets cash ON cash.id = ai.asset_id
                 WHERE ai.asset_id = ap.asset_id
                   AND ai.identifier_type = 'iso_currency'
                   AND cash.asset_category = 'cash'
               )`;
          const positions = yield* sql<{
            readonly count: number;
          }>`SELECT count(*) AS count FROM position_snapshots
            WHERE snapshot_id = ${id}`;
          const prices = yield* sql<{
            readonly count: number;
          }>`SELECT count(*) AS count FROM asset_price_snapshots
            WHERE snapshot_id = ${id}`;
          return { positionCount: positions[0]?.count ?? 0, priceCount: prices[0]?.count ?? 0 };
        }),
      ),
    );
    return { id, capturedAt, ...result };
  });

interface HistoricalPositionRow {
  readonly snapshot_id: string;
  readonly captured_at: string;
  readonly total_debt: string | null;
  readonly asset_id: string | null;
  readonly asset_category: AssetCategory | null;
  readonly quantity: string | null;
  readonly price: string | null;
  readonly currency_asset_id: string | null;
}

export const getPortfolioHistory = (): FinanceEffect<ReadonlyArray<PortfolioHistoryPoint>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const selected = yield* reportingCurrency;
    const fxPivotId = yield* usdAssetId;
    const rows = yield* db(sql<HistoricalPositionRow>`SELECT s.id AS snapshot_id, s.captured_at,
      s.total_debt, p.asset_id, a.asset_category, ps.quantity, aps.price, aps.currency_asset_id
      FROM snapshots s
      LEFT JOIN position_snapshots ps ON ps.snapshot_id = s.id
      LEFT JOIN positions p ON p.id = ps.position_id
      LEFT JOIN assets a ON a.id = p.asset_id
      LEFT JOIN asset_price_snapshots aps ON aps.snapshot_id = s.id AND aps.asset_id = p.asset_id
      ORDER BY s.captured_at, s.id`);
    const fxRows = yield* db(
      sql<{
        readonly snapshot_id: string;
        readonly asset_id: string;
        readonly price: string;
      }>`SELECT snapshot_id, asset_id, price FROM asset_price_snapshots
        WHERE currency_asset_id = ${fxPivotId}`,
    );
    const fx = new Map(
      fxRows.map(
        ({ snapshot_id, asset_id, price }) => [`${snapshot_id}:${asset_id}`, price] as const,
      ),
    );
    const grouped = Map.groupBy(rows, ({ snapshot_id }) => snapshot_id);
    return [...grouped.values()].map((snapshotRows) => {
      const first = snapshotRows[0]!;
      let total = "0";
      let totalIncomplete = false;
      const categories = {
        stocks_etfs: "0",
        crypto: "0",
        cash: "0",
        other: "0",
      } satisfies Record<AssetCategory, string>;
      const snapshotFx = new Map(
        [...fx].flatMap(([key, price]) => {
          const prefix = `${first.snapshot_id}:`;
          return key.startsWith(prefix) ? [[key.slice(prefix.length), price] as const] : [];
        }),
      );
      for (const row of snapshotRows) {
        if (row.asset_id === null || row.quantity === null) continue;
        const converted =
          row.asset_category === "cash"
            ? convertAmount(row.quantity, row.asset_id, selected.assetId, fxPivotId, snapshotFx)
            : row.price === null || row.currency_asset_id === null
              ? undefined
              : convertAmount(
                  multiplyDecimal(row.quantity, row.price),
                  row.currency_asset_id,
                  selected.assetId,
                  fxPivotId,
                  snapshotFx,
                );
        if (converted === undefined) totalIncomplete = true;
        else {
          total = addDecimal(total, converted);
          const category = row.asset_category ?? "other";
          categories[category] = addDecimal(categories[category], converted);
        }
      }
      return {
        snapshotId: first.snapshot_id,
        capturedAt: first.captured_at,
        total,
        totalDebt: first.total_debt === null ? "0" : canonicalDecimal(first.total_debt),
        totalIncomplete,
        categories,
      };
    });
  });

const allocationCells = (
  values: ReadonlyArray<{
    readonly key: string;
    readonly name: string;
    readonly symbol: string | null;
    readonly assetCategory?: AssetCategory;
    readonly value: string;
  }>,
): ReadonlyArray<AllocationCell> => {
  const denominator = values.reduce((sum, cell) => addDecimal(sum, cell.value), "0");
  return values
    .map((cell) => ({
      ...cell,
      percent:
        compareDecimal(denominator, "0") === 0
          ? "0"
          : multiplyDecimal(divideDecimal(cell.value, denominator), "100"),
    }))
    .sort(
      (left, right) =>
        compareDecimal(right.value, left.value) || left.name.localeCompare(right.name),
    );
};

const loadValuedAccounts = (valuationCurrencyAssetId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{
        readonly id: string;
      }>`SELECT id FROM accounts ORDER BY created_at, id`,
    );
    return yield* Effect.forEach(rows, (row) => getAccount(row.id, valuationCurrencyAssetId));
  });

const buildCustodianGroups = (
  valued: ReadonlyArray<Account>,
  connectors: ReadonlyMap<string, string | null>,
): DashboardCustodianGroup[] => {
  const accountRows: DashboardAccountRow[] = valued.map((account) => ({
    accountId: account.id,
    accountName: account.name,
    accountType: account.accountType,
    positionCount: account.positions.filter(
      (position) => compareDecimal(position.quantity, "0") !== 0,
    ).length,
    total: account.total,
    unrealizedPnl: account.unrealizedPnl,
    unrealizedPnlPercent: account.unrealizedPnlPercent,
    totalIncomplete: account.totalIncomplete,
  }));
  const byCustodian = Map.groupBy(valued, (account) => account.custodianId);
  const groups: DashboardCustodianGroup[] = [...byCustodian].flatMap(([custodianId, accounts]) => {
    const first = accounts[0]!;
    const meaningful =
      !first.isDefaultCustodian ||
      accounts.some((account) =>
        account.positions.some((position) => compareDecimal(position.quantity, "0") !== 0),
      );
    if (!meaningful) return [];
    const groupAccounts = accountRows
      .filter((row) => accounts.some((account) => account.id === row.accountId))
      .sort(
        (left, right) =>
          compareDecimal(right.total, left.total) ||
          left.accountName.localeCompare(right.accountName),
      );
    return [
      {
        custodianId,
        name: first.custodianName,
        isDefault: first.isDefaultCustodian,
        connectorId: connectors.get(custodianId) ?? null,
        accounts: groupAccounts,
      },
    ];
  });
  groups.sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
  return groups;
};

/** Custodian-grouped account cards for the Accounts page, valued in the Reporting currency. */
export const listAccountGroups = (): FinanceEffect<ReadonlyArray<DashboardCustodianGroup>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const selected = yield* reportingCurrency;
    const valued = yield* loadValuedAccounts(selected.assetId);
    const connectors = new Map(
      (yield* db(
        sql<{
          readonly id: string;
          readonly connector_id: string | null;
        }>`SELECT id, connector_id FROM custodians`,
      )).map((row) => [row.id, row.connector_id] as const),
    );
    return buildCustodianGroups(valued, connectors);
  });

export const getDashboard = (): FinanceEffect<Dashboard> =>
  Effect.gen(function* () {
    const selected = yield* reportingCurrency;
    const history = yield* getPortfolioHistory();
    const valued = yield* loadValuedAccounts(selected.assetId);
    const byAsset = new Map<
      string,
      {
        name: string;
        symbol: string | null;
        assetCategory: AssetCategory;
        value: string;
        unpriced: boolean;
        quantity: string;
      }
    >();
    for (const account of valued) {
      for (const position of account.positions) {
        const current = byAsset.get(position.assetId) ?? {
          name: position.assetName,
          symbol: position.assetSymbol,
          assetCategory: position.assetCategory,
          value: "0",
          unpriced: false,
          quantity: "0",
        };
        current.quantity = addDecimal(current.quantity, position.quantity);
        if (compareDecimal(position.quantity, "0") !== 0 && position.reportingValue === null)
          current.unpriced = true;
        if (position.reportingValue !== null)
          current.value = addDecimal(current.value, position.reportingValue);
        byAsset.set(position.assetId, current);
      }
    }
    const meaningful = [...byAsset.entries()].filter(
      ([, asset]) => compareDecimal(asset.quantity, "0") !== 0,
    );
    const unpricedAssetCount = meaningful.filter(([, asset]) => asset.unpriced).length;
    const negativeHoldingCount = meaningful.filter(
      ([, asset]) => compareDecimal(asset.value, "0") < 0,
    ).length;
    const positive = meaningful.filter(
      ([, asset]) => !asset.unpriced && compareDecimal(asset.value, "0") > 0,
    );
    const assetAllocation = allocationCells(
      positive.map(([assetId, asset]) => ({
        key: assetId,
        name: asset.name,
        symbol: asset.symbol,
        assetCategory: asset.assetCategory,
        value: asset.value,
      })),
    );
    const byCategory = Map.groupBy(positive, ([, asset]) => asset.assetCategory);
    const categoryAllocation = allocationCells(
      [...byCategory].map(([assetCategory, assets]) => ({
        key: assetCategory,
        name: ASSET_CATEGORY_LABELS[assetCategory],
        symbol: null,
        assetCategory,
        value: assets.reduce((sum, [, asset]) => addDecimal(sum, asset.value), "0"),
      })),
    );
    const custodianValues = new Map<string, { readonly name: string; readonly value: string }>();
    for (const account of valued) {
      let value = "0";
      for (const position of account.positions) {
        if (
          compareDecimal(position.quantity, "0") === 0 ||
          position.reportingValue === null ||
          compareDecimal(position.reportingValue, "0") <= 0
        )
          continue;
        value = addDecimal(value, position.reportingValue);
      }
      const current = custodianValues.get(account.custodianId) ?? {
        name: account.isDefaultCustodian ? "Other holdings" : account.custodianName,
        value: "0",
      };
      custodianValues.set(account.custodianId, {
        name: current.name,
        value: addDecimal(current.value, value),
      });
    }
    const custodianAllocation = allocationCells(
      [...custodianValues].map(([custodianId, group]) => ({
        key: custodianId,
        name: group.name,
        symbol: null,
        value: group.value,
      })),
    );
    const fxPivotId = yield* usdAssetId;
    const fx = yield* loadFxMap(fxPivotId);
    const { total: totalDebt, incomplete: debtIncomplete } = yield* sumDebtsIn(
      selected,
      fxPivotId,
      fx,
    );
    let unrealizedPnl = "0";
    let acquisitionCostInReportingCurrency = "0";
    for (const account of valued) {
      for (const position of account.positions) {
        if (
          position.unrealizedPnl === null ||
          position.acquisitionCost === null ||
          position.averageUnitPurchasePrice === null
        )
          continue;
        const acquisitionCost = convertAmount(
          position.acquisitionCost,
          position.averageUnitPurchasePrice.currencyAssetId,
          selected.assetId,
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
    }
    const totalAssets = valued.reduce((sum, account) => addDecimal(sum, account.total), "0");
    return {
      reportingCurrency: selected,
      totalAssets,
      totalDebt,
      netWorth: subtractDecimal(totalAssets, totalDebt),
      unrealizedPnl,
      unrealizedPnlPercent:
        compareDecimal(acquisitionCostInReportingCurrency, "0") === 0
          ? null
          : divideDecimal(unrealizedPnl, acquisitionCostInReportingCurrency),
      totalIncomplete: valued.some((account) => account.totalIncomplete) || debtIncomplete,
      unpricedAssetCount,
      negativeHoldingCount,
      hasMeaningfulAssets: meaningful.length > 0,
      custodianAllocation,
      assetAllocation,
      categoryAllocation,
      history,
    };
  });
