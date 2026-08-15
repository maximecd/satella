import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";

import { SqlClient } from "effect/unstable/sql";
import type {
  AllocationCell,
  AssetCategory,
  Dashboard,
  DashboardAccountRow,
  PortfolioHistoryPoint,
  SnapshotResult,
} from "../contracts.js";
import { ASSET_CATEGORY_LABELS } from "../contracts.js";
import { DEFAULT_SNAPSHOT_INTERVAL } from "../config.js";
import { getAccount } from "../accounts/AccountSql.js";
import { refreshPrices, type MarketDataRegistry } from "../market-data.js";
import {
  convertAmount,
  db,
  reportingCurrency,
  usdAssetId,
  type FinanceEffect,
} from "../internal/sql.js";

export interface CaptureSnapshotOptions {
  readonly refresh?: boolean;
  readonly registry?: MarketDataRegistry;
  readonly now?: () => Date;
}

export const captureSnapshot = (
  options: CaptureSnapshotOptions = {},
): FinanceEffect<SnapshotResult> =>
  Effect.gen(function* () {
    if (options.refresh !== false) {
      yield* refreshPrices({
        requireFresh: true,
        includeAllCashFx: true,
        ...(options.registry === undefined ? {} : { registry: options.registry }),
      });
    }
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const capturedAt = (options.now ?? (() => new Date()))().toISOString();
    const result = yield* db(
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO snapshots (id, captured_at) VALUES (${id}, ${capturedAt})`;
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

export const captureSnapshotIfDue = (
  options: CaptureSnapshotOptions = {},
): FinanceEffect<SnapshotResult | null> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const latest = yield* db(sql<{ readonly captured_at: string }>`SELECT captured_at FROM snapshots
      ORDER BY captured_at DESC LIMIT 1`);
    const now = (options.now ?? (() => new Date()))();
    const previous = latest[0]?.captured_at;
    if (
      previous !== undefined &&
      now.getTime() - Date.parse(previous) < Duration.toMillis(DEFAULT_SNAPSHOT_INTERVAL)
    ) {
      return null;
    }
    return yield* captureSnapshot({ ...options, now: () => now });
  });

interface HistoricalPositionRow {
  readonly snapshot_id: string;
  readonly captured_at: string;
  readonly asset_id: string | null;
  readonly asset_category: AssetCategory | null;
  readonly quantity: number | null;
  readonly price: number | null;
  readonly currency_asset_id: string | null;
}

export const getPortfolioHistory = (): FinanceEffect<ReadonlyArray<PortfolioHistoryPoint>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const selected = yield* reportingCurrency;
    const fxPivotId = yield* usdAssetId;
    const rows = yield* db(sql<HistoricalPositionRow>`SELECT s.id AS snapshot_id, s.captured_at,
      p.asset_id, a.asset_category, ps.quantity, aps.price, aps.currency_asset_id
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
        readonly price: number;
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
      let total = 0;
      let totalIncomplete = false;
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
                  row.quantity * row.price,
                  row.currency_asset_id,
                  selected.assetId,
                  fxPivotId,
                  snapshotFx,
                );
        if (converted === undefined) totalIncomplete = true;
        else total += converted;
      }
      return {
        snapshotId: first.snapshot_id,
        capturedAt: first.captured_at,
        total,
        totalIncomplete,
      };
    });
  });

const allocationCells = (
  values: ReadonlyArray<{
    readonly key: string;
    readonly name: string;
    readonly symbol: string | null;
    readonly assetCategory: AssetCategory;
    readonly value: number;
  }>,
): ReadonlyArray<AllocationCell> => {
  const denominator = values.reduce((sum, cell) => sum + cell.value, 0);
  return values
    .map((cell) => ({
      ...cell,
      percent: denominator === 0 ? 0 : (cell.value / denominator) * 100,
    }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
};

export const getDashboard = (): FinanceEffect<Dashboard> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const selected = yield* reportingCurrency;
    const history = yield* getPortfolioHistory();
    const rows = yield* db(
      sql<{
        readonly id: string;
      }>`SELECT id FROM accounts ORDER BY created_at, id`,
    );
    const valued = yield* Effect.forEach(rows, (row) => getAccount(row.id, selected.assetId));
    const accounts: DashboardAccountRow[] = valued
      .map((account) => ({
        accountId: account.id,
        accountName: account.name,
        connectionId: account.connectionId,
        connectionName: account.connectionName,
        positionCount: account.positions.filter((position) => position.quantity !== 0).length,
        total: account.total,
        totalIncomplete: account.totalIncomplete,
      }))
      .sort(
        (left, right) =>
          right.total - left.total || left.accountName.localeCompare(right.accountName),
      );
    const byAsset = new Map<
      string,
      {
        name: string;
        symbol: string | null;
        assetCategory: AssetCategory;
        value: number;
        unpriced: boolean;
        quantity: number;
      }
    >();
    for (const account of valued) {
      for (const position of account.positions) {
        const current = byAsset.get(position.assetId) ?? {
          name: position.assetName,
          symbol: position.assetSymbol,
          assetCategory: position.assetCategory,
          value: 0,
          unpriced: false,
          quantity: 0,
        };
        current.quantity += position.quantity;
        if (position.quantity !== 0 && position.reportingValue === null) current.unpriced = true;
        current.value += position.reportingValue ?? 0;
        byAsset.set(position.assetId, current);
      }
    }
    const meaningful = [...byAsset.entries()].filter(([, asset]) => asset.quantity !== 0);
    const unpricedAssetCount = meaningful.filter(([, asset]) => asset.unpriced).length;
    const negativeHoldingCount = meaningful.filter(([, asset]) => asset.value < 0).length;
    const positive = meaningful.filter(([, asset]) => !asset.unpriced && asset.value > 0);
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
        value: assets.reduce((sum, [, asset]) => sum + asset.value, 0),
      })),
    );
    return {
      reportingCurrency: selected,
      portfolioValue: accounts.reduce((sum, account) => sum + account.total, 0),
      totalIncomplete: accounts.some((account) => account.totalIncomplete),
      unpricedAssetCount,
      negativeHoldingCount,
      hasMeaningfulAssets: meaningful.length > 0,
      accounts,
      assetAllocation,
      categoryAllocation,
      history,
    };
  });
