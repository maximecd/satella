import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type {
  Asset,
  CreateAssetInput,
  IdentifierInput,
  SetManualPriceInput,
  UpdateCustomAssetInput,
} from "../contracts.js";
import {
  assertCash,
  db,
  failure,
  firstOrNotFound,
  loadPrice,
  MANUAL_ASSET_CATEGORIES,
  nowIso,
  requireFinite,
  requireNonEmpty,
  type AssetRow,
  type FinanceEffect,
  type IdentifierRow,
} from "../internal/sql.js";

export const getAsset = (id: string): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const asset = yield* firstOrNotFound(
      yield* db(sql<AssetRow>`SELECT id, asset_category, name, symbol, created_at, updated_at
        FROM assets WHERE id = ${id}`),
      "Asset",
    );
    const identifiers = yield* db(sql<IdentifierRow>`SELECT identifier_type, identifier_value
      FROM asset_identifiers WHERE asset_id = ${id} ORDER BY identifier_type, identifier_value`);
    const price = yield* loadPrice(id);
    return {
      id: asset.id,
      assetCategory: asset.asset_category,
      name: asset.name,
      symbol: asset.symbol,
      identifiers: identifiers.map(({ identifier_type: type, identifier_value: value }) => ({
        type,
        value,
      })),
      price,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
    };
  });

export const listAssets = (): FinanceEffect<ReadonlyArray<Asset>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<{ readonly id: string }>`SELECT id FROM assets ORDER BY name, id`);
    return yield* Effect.forEach(rows, ({ id }) => getAsset(id));
  });

export const findByStrongIdentifier = (identifiers: ReadonlyArray<IdentifierInput>) =>
  Effect.gen(function* () {
    if (identifiers.length === 0) return undefined;
    const sql = yield* SqlClient.SqlClient;
    for (const identifier of identifiers) {
      const rows = yield* db(sql<{
        readonly asset_id: string;
      }>`SELECT asset_id FROM asset_identifiers
        WHERE identifier_type = ${identifier.type.trim()} AND identifier_value = ${identifier.value.trim()}`);
      if (rows[0] !== undefined) return rows[0].asset_id;
    }
    return undefined;
  });

export const createAsset = (input: CreateAssetInput): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    const name = yield* requireNonEmpty(input.name, "Asset name");
    const identifiers = input.identifiers ?? [];
    const existingId = yield* findByStrongIdentifier(identifiers);
    if (existingId !== undefined) return yield* getAsset(existingId);

    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
            VALUES (${id}, ${input.assetCategory}, ${name}, ${input.symbol?.trim() ?? null}, ${timestamp}, ${timestamp})`;
          for (const identifier of identifiers) {
            yield* sql`INSERT INTO asset_identifiers
              (id, asset_id, identifier_type, identifier_value)
              VALUES (${randomUUID()}, ${id}, ${identifier.type.trim()}, ${identifier.value.trim()})`;
          }
        }),
      ),
    );
    return yield* getAsset(id);
  });

export const updateCustomAsset = (
  id: string,
  input: UpdateCustomAssetInput,
): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    const asset = yield* getAsset(id);
    if (!MANUAL_ASSET_CATEGORIES.has(asset.assetCategory)) {
      return yield* Effect.fail(failure("read_only", "Automatic assets are read-only"));
    }
    const name = yield* requireNonEmpty(input.name, "Asset name");
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`UPDATE assets SET name = ${name}, symbol = ${input.symbol?.trim() ?? null},
      updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* getAsset(id);
  });

export const setManualPrice = (id: string, input: SetManualPriceInput): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    yield* requireFinite(input.price, "Price");
    const asset = yield* getAsset(id);
    if (!MANUAL_ASSET_CATEGORIES.has(asset.assetCategory)) {
      return yield* Effect.fail(
        failure("read_only", "Manual prices are allowed only for assets without automatic pricing"),
      );
    }
    yield* assertCash(input.currencyAssetId);
    const sql = yield* SqlClient.SqlClient;
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO asset_prices
      (asset_id, price, currency_asset_id, source, observed_at, updated_at)
      VALUES (${id}, ${input.price}, ${input.currencyAssetId}, 'manual', ${input.observedAt ?? timestamp}, ${timestamp})
      ON CONFLICT(asset_id) DO UPDATE SET price = excluded.price,
        currency_asset_id = excluded.currency_asset_id, source = 'manual',
        observed_at = excluded.observed_at, updated_at = excluded.updated_at`);
    return yield* getAsset(id);
  });

export const deleteAsset = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* getAsset(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM assets WHERE id = ${id}`);
  });
