import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type { CreateDebtInput, Debt, DebtKind, UpdateDebtInput } from "../contracts.js";
import { canonicalDecimal } from "../financial-number.js";
import {
  assertCash,
  db,
  failure,
  firstOrNotFound,
  nowIso,
  requireNonEmpty,
  requirePositive,
  type FinanceEffect,
} from "../internal/sql.js";

export interface DebtRow {
  readonly id: string;
  readonly name: string;
  readonly kind: DebtKind;
  readonly amount: string;
  readonly currency_asset_id: string;
  readonly currency_iso: string;
  readonly due_date: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const loadDebt = (row: DebtRow): Debt => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  amount: canonicalDecimal(row.amount),
  currencyAssetId: row.currency_asset_id,
  currencyIso: row.currency_iso,
  dueDate: row.due_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const requireDueDate = (dueDate: string | null | undefined) =>
  dueDate === undefined || dueDate === null || DUE_DATE_PATTERN.test(dueDate)
    ? Effect.succeed(dueDate ?? null)
    : Effect.fail(failure("validation", "Due date must be a calendar date (YYYY-MM-DD)"));

const getDebtRow = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<DebtRow>`SELECT d.id, d.name, d.kind, d.amount,
      d.currency_asset_id,
      COALESCE(ai.identifier_value, ca.symbol, ca.name) AS currency_iso,
      d.due_date, d.created_at, d.updated_at
      FROM debts d
      JOIN assets ca ON ca.id = d.currency_asset_id
      LEFT JOIN asset_identifiers ai ON ai.asset_id = ca.id AND ai.identifier_type = 'iso_currency'
      WHERE d.id = ${id}`);
    return yield* firstOrNotFound(rows, "Debt");
  });

export const getDebt = (id: string): FinanceEffect<Debt> =>
  Effect.gen(function* () {
    return loadDebt(yield* getDebtRow(id));
  });

export const listDebts = (): FinanceEffect<ReadonlyArray<Debt>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<DebtRow>`SELECT d.id, d.name, d.kind, d.amount,
      d.currency_asset_id,
      COALESCE(ai.identifier_value, ca.symbol, ca.name) AS currency_iso,
      d.due_date, d.created_at, d.updated_at
      FROM debts d
      JOIN assets ca ON ca.id = d.currency_asset_id
      LEFT JOIN asset_identifiers ai ON ai.asset_id = ca.id AND ai.identifier_type = 'iso_currency'
      ORDER BY d.created_at, d.id`);
    return rows.map(loadDebt);
  });

export const createDebt = (input: CreateDebtInput): FinanceEffect<Debt> =>
  Effect.gen(function* () {
    const name = yield* requireNonEmpty(input.name, "Debt name");
    const amount = yield* requirePositive(input.amount, "Debt amount");
    yield* assertCash(input.currencyAssetId);
    const dueDate = yield* requireDueDate(input.dueDate);
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO debts
      (id, name, kind, amount, currency_asset_id, due_date, created_at, updated_at)
      VALUES (${id}, ${name}, ${input.kind}, ${amount}, ${input.currencyAssetId}, ${dueDate}, ${timestamp}, ${timestamp})`);
    return yield* getDebt(id);
  });

export const updateDebt = (id: string, input: UpdateDebtInput): FinanceEffect<Debt> =>
  Effect.gen(function* () {
    const existing = yield* getDebtRow(id);
    const name = yield* requireNonEmpty(input.name ?? existing.name, "Debt name");
    const kind = input.kind ?? existing.kind;
    const amount =
      input.amount === undefined
        ? existing.amount
        : yield* requirePositive(input.amount, "Debt amount");
    const currencyAssetId = input.currencyAssetId ?? existing.currency_asset_id;
    yield* assertCash(currencyAssetId);
    const dueDate = yield* requireDueDate(
      input.dueDate === undefined ? existing.due_date : input.dueDate,
    );
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`UPDATE debts SET name = ${name}, kind = ${kind}, amount = ${amount},
      currency_asset_id = ${currencyAssetId}, due_date = ${dueDate}, updated_at = ${nowIso()}
      WHERE id = ${id}`);
    return yield* getDebt(id);
  });

export const deleteDebt = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* getDebtRow(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM debts WHERE id = ${id}`);
  });
