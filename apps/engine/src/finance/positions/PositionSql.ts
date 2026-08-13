import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type { Account, CreatePositionInput } from "../contracts.js";
import { getAccount, assertManualAccountOwner } from "../accounts/AccountSql.js";
import { getAsset } from "../assets/AssetSql.js";
import { db, firstOrNotFound, nowIso, requireFinite, type FinanceEffect } from "../internal/sql.js";

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

export const getPositionAccount = (id: string): FinanceEffect<Account> =>
  positionAccountId(id).pipe(Effect.flatMap(getAccount));

export const deletePosition = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    const accountId = yield* positionAccountId(id);
    yield* assertManualAccountOwner(accountId);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM positions WHERE id = ${id}`);
  });
