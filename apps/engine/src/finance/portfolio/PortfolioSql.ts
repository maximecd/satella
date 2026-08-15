import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";

import { SqlClient } from "effect/unstable/sql";
import type {
  AssetCategory,
  Dashboard,
  PortfolioHistoryPoint,
  SnapshotResult,
} from "../contracts.js";
import { CONNECTOR_CAPABILITIES, DEFAULT_SNAPSHOT_INTERVAL } from "../config.js";
import { getAccount } from "../accounts/AccountSql.js";
import { refreshPrices, type MarketDataRegistry } from "../market-data.js";
import { db, usdAssetId, type FinanceEffect } from "../internal/sql.js";

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
        ...(options.registry === undefined ? {} : { registry: options.registry }),
      });
    }
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const capturedAt = (options.now ?? (() => new Date()))().toISOString();
    const result = yield* db(
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`DELETE FROM snapshots WHERE date(captured_at) = date(${capturedAt})`;
          yield* sql`INSERT INTO snapshots (id, captured_at) VALUES (${id}, ${capturedAt})`;
          yield* sql`INSERT INTO position_snapshots (snapshot_id, position_id, quantity)
            SELECT ${id}, id, quantity FROM positions`;
          yield* sql`INSERT INTO asset_price_snapshots
            (snapshot_id, asset_id, price, currency_asset_id, source, observed_at)
            SELECT ${id}, ap.asset_id, ap.price, ap.currency_asset_id, ap.source, ap.observed_at
            FROM asset_prices ap WHERE EXISTS (SELECT 1 FROM positions p WHERE p.asset_id = ap.asset_id)`;
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
    const reportingCurrencyId = yield* usdAssetId;
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
      }>`SELECT
        snapshot_id, asset_id, price FROM asset_price_snapshots
        WHERE currency_asset_id = ${reportingCurrencyId}`,
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
      for (const row of snapshotRows) {
        if (row.asset_id === null || row.quantity === null) continue;
        const implicit = row.asset_category === "cash" && row.asset_id === reportingCurrencyId;
        const price = row.price ?? (implicit ? 1 : null);
        const currencyId = row.currency_asset_id ?? (implicit ? reportingCurrencyId : null);
        const conversion =
          currencyId === reportingCurrencyId
            ? 1
            : currencyId === null
              ? undefined
              : fx.get(`${row.snapshot_id}:${currencyId}`);
        if (price === null || conversion === undefined) totalIncomplete = true;
        else total += row.quantity * price * conversion;
      }
      return {
        snapshotId: first.snapshot_id,
        capturedAt: first.captured_at,
        total,
        totalIncomplete,
      };
    });
  });

export const getDashboard = (): FinanceEffect<Dashboard> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<{
      readonly id: string;
      readonly connection_id: string | null;
      readonly connector_id: string | null;
    }>`SELECT a.id, a.connection_id, c.connector_id
      FROM accounts a
      LEFT JOIN connections c ON c.id = a.connection_id
      ORDER BY a.created_at, a.id`);
    const accounts = yield* Effect.forEach(rows, (row) =>
      getAccount(row.id).pipe(
        Effect.map((account) => {
          const connector = CONNECTOR_CAPABILITIES.find(({ id }) => id === row.connector_id);
          return {
            accountId: account.id,
            accountName: account.name,
            connectionId: account.connectionId,
            connectionName: account.connectionName,
            connectorId: row.connector_id,
            connectorName: connector?.name ?? null,
            baseCurrencyIso: account.baseCurrencyIso,
            positionCount: account.positions.filter((position) => position.quantity !== 0).length,
            total: account.total,
            totalIncomplete: account.totalIncomplete,
            hasStalePrices: account.hasStalePrices,
          };
        }),
      ),
    );
    return { accounts };
  });
