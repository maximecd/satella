import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type { Account, CreatePositionInput, PositionEdit } from "../contracts.js";
import { getAccount, assertManualAccountOwner, loadPosition } from "../accounts/AccountSql.js";
import { getAsset } from "../assets/AssetSql.js";
import {
  db,
  firstOrNotFound,
  loadFxMap,
  nowIso,
  requireFinite,
  usdAssetId,
  type AccountRow,
  type FinanceEffect,
  type PositionRow,
} from "../internal/sql.js";

export const createPosition = (input: CreatePositionInput): FinanceEffect<Account> =>
  Effect.gen(function* () {
    yield* assertManualAccountOwner(input.accountId);
    yield* getAsset(input.assetId);
    yield* requireFinite(input.quantity, "Quantity");
    const sql = yield* SqlClient.SqlClient;
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
      VALUES (${randomUUID()}, ${input.accountId}, ${input.assetId}, ${input.quantity}, ${timestamp}, ${timestamp})`);
    return yield* getAccount(input.accountId);
  });

export const positionAccountId = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly account_id: string }>`SELECT account_id FROM positions WHERE id = ${id}`,
    );
    return (yield* firstOrNotFound(rows, "Position")).account_id;
  });

export const updatePosition = (id: string, quantity: number): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const accountId = yield* positionAccountId(id);
    yield* assertManualAccountOwner(accountId);
    yield* requireFinite(quantity, "Quantity");
    const sql = yield* SqlClient.SqlClient;
    yield* db(
      sql`UPDATE positions SET quantity = ${quantity}, updated_at = ${nowIso()} WHERE id = ${id}`,
    );
    return yield* getAccount(accountId);
  });

export const getPositionEdit = (id: string): FinanceEffect<PositionEdit> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const account = yield* firstOrNotFound(
      yield* db(sql<AccountRow>`SELECT a.id, a.connection_id, c.name AS connection_name,
        a.name, a.base_currency_asset_id,
        COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
        a.connector_account_id, a.created_at, a.updated_at
        FROM positions p
        JOIN accounts a ON a.id = p.account_id
        LEFT JOIN connections c ON c.id = a.connection_id
        JOIN assets ba ON ba.id = a.base_currency_asset_id
        LEFT JOIN asset_identifiers ai ON ai.asset_id = ba.id AND ai.identifier_type = 'iso_currency'
        WHERE p.id = ${id}`),
      "Position",
    );
    const row = yield* firstOrNotFound(
      yield* db(sql<PositionRow>`SELECT p.id, p.account_id, p.asset_id,
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
        WHERE p.id = ${id}`),
      "Position",
    );
    const fxPivotId = yield* usdAssetId;
    const fx = yield* loadFxMap(fxPivotId);
    return {
      position: loadPosition(row, account.base_currency_asset_id, fxPivotId, fx),
      account: {
        id: account.id,
        name: account.name,
        connectionId: account.connection_id,
        connectionName: account.connection_name,
      },
    };
  });

export const deletePosition = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    const accountId = yield* positionAccountId(id);
    yield* assertManualAccountOwner(accountId);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM positions WHERE id = ${id}`);
  });
