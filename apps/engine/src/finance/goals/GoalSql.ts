import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type { CreateGoalInput, Goal, GoalAccount, UpdateGoalInput } from "../contracts.js";
import { addDecimal, canonicalDecimal } from "../financial-number.js";
import { getAccount } from "../accounts/AccountSql.js";
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

export interface GoalRow {
  readonly id: string;
  readonly name: string;
  readonly amount: string;
  readonly currency_asset_id: string;
  readonly currency_iso: string;
  readonly target_date: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const requireTargetDate = (targetDate: string | null | undefined) =>
  targetDate === undefined || targetDate === null || TARGET_DATE_PATTERN.test(targetDate)
    ? Effect.succeed(targetDate ?? null)
    : Effect.fail(failure("validation", "Target date must be a calendar date (YYYY-MM-DD)"));

const uniqueAccountIds = (accountIds: ReadonlyArray<string>) => [...new Set(accountIds)];

const getGoalRow = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<GoalRow>`SELECT g.id, g.name, g.amount,
      g.currency_asset_id,
      COALESCE(ai.identifier_value, ca.symbol, ca.name) AS currency_iso,
      g.target_date, g.created_at, g.updated_at
      FROM goals g
      JOIN assets ca ON ca.id = g.currency_asset_id
      LEFT JOIN asset_identifiers ai ON ai.asset_id = ca.id AND ai.identifier_type = 'iso_currency'
      WHERE g.id = ${id}`);
    return yield* firstOrNotFound(rows, "Goal");
  });

const listContributingAccounts = (goalId: string): FinanceEffect<ReadonlyArray<GoalAccount>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* db(sql<GoalAccount>`SELECT a.id, a.name
      FROM goal_accounts ga
      JOIN accounts a ON a.id = ga.account_id
      WHERE ga.goal_id = ${goalId}
      ORDER BY a.name, a.id`);
  });

const currentAmountIn = (
  accounts: ReadonlyArray<GoalAccount>,
  currencyAssetId: string,
): FinanceEffect<string> =>
  Effect.gen(function* () {
    let total = "0";
    for (const account of accounts) {
      const valued = yield* getAccount(account.id, currencyAssetId);
      total = addDecimal(total, valued.total);
    }
    return total;
  });

const loadGoal = (
  row: GoalRow,
  accounts: ReadonlyArray<GoalAccount>,
  currentAmount: string,
): Goal => ({
  id: row.id,
  name: row.name,
  amount: canonicalDecimal(row.amount),
  currencyAssetId: row.currency_asset_id,
  currencyIso: row.currency_iso,
  targetDate: row.target_date,
  currentAmount,
  contributingAccounts: accounts,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assembleGoal = (row: GoalRow): FinanceEffect<Goal> =>
  Effect.gen(function* () {
    const accounts = yield* listContributingAccounts(row.id);
    const currentAmount = yield* currentAmountIn(accounts, row.currency_asset_id);
    return loadGoal(row, accounts, currentAmount);
  });

const assertAccountsAvailable = (
  accountIds: ReadonlyArray<string>,
  exceptGoalId: string | null,
): FinanceEffect<void> =>
  Effect.gen(function* () {
    const ids = uniqueAccountIds(accountIds);
    if (ids.length === 0) return;
    const sql = yield* SqlClient.SqlClient;
    const found = yield* db(
      sql<{ readonly id: string }>`SELECT id FROM accounts WHERE id IN ${sql.in(ids)}`,
    );
    if (found.length !== ids.length) {
      return yield* Effect.fail(failure("not_found", "Account was not found"));
    }
    const taken =
      exceptGoalId === null
        ? yield* db(
            sql<{ readonly account_id: string }>`SELECT account_id FROM goal_accounts
              WHERE account_id IN ${sql.in(ids)}`,
          )
        : yield* db(
            sql<{ readonly account_id: string }>`SELECT account_id FROM goal_accounts
              WHERE account_id IN ${sql.in(ids)} AND goal_id <> ${exceptGoalId}`,
          );
    if (taken.length > 0) {
      return yield* Effect.fail(
        failure("validation", "An Account can contribute to at most one Goal"),
      );
    }
  });

const replaceGoalAccounts = (
  goalId: string,
  accountIds: ReadonlyArray<string>,
): FinanceEffect<void> =>
  Effect.gen(function* () {
    const ids = uniqueAccountIds(accountIds);
    yield* assertAccountsAvailable(ids, goalId);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM goal_accounts WHERE goal_id = ${goalId}`);
    for (const accountId of ids) {
      yield* db(
        sql`INSERT INTO goal_accounts (goal_id, account_id) VALUES (${goalId}, ${accountId})`,
      );
    }
  });

export const getGoal = (id: string): FinanceEffect<Goal> =>
  Effect.gen(function* () {
    return yield* assembleGoal(yield* getGoalRow(id));
  });

export const listGoals = (): FinanceEffect<ReadonlyArray<Goal>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<GoalRow>`SELECT g.id, g.name, g.amount,
      g.currency_asset_id,
      COALESCE(ai.identifier_value, ca.symbol, ca.name) AS currency_iso,
      g.target_date, g.created_at, g.updated_at
      FROM goals g
      JOIN assets ca ON ca.id = g.currency_asset_id
      LEFT JOIN asset_identifiers ai ON ai.asset_id = ca.id AND ai.identifier_type = 'iso_currency'
      ORDER BY g.created_at, g.id`);
    const goals: Goal[] = [];
    for (const row of rows) {
      goals.push(yield* assembleGoal(row));
    }
    return goals;
  });

export const createGoal = (input: CreateGoalInput): FinanceEffect<Goal> =>
  Effect.gen(function* () {
    const name = yield* requireNonEmpty(input.name, "Goal name");
    const amount = yield* requirePositive(input.amount, "Goal amount");
    yield* assertCash(input.currencyAssetId);
    const targetDate = yield* requireTargetDate(input.targetDate);
    const accountIds = uniqueAccountIds(input.accountIds);
    yield* assertAccountsAvailable(accountIds, null);
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO goals
      (id, name, amount, currency_asset_id, target_date, created_at, updated_at)
      VALUES (${id}, ${name}, ${amount}, ${input.currencyAssetId}, ${targetDate}, ${timestamp}, ${timestamp})`);
    yield* replaceGoalAccounts(id, accountIds);
    return yield* getGoal(id);
  });

export const updateGoal = (id: string, input: UpdateGoalInput): FinanceEffect<Goal> =>
  Effect.gen(function* () {
    const existing = yield* getGoalRow(id);
    const name = yield* requireNonEmpty(input.name ?? existing.name, "Goal name");
    const amount =
      input.amount === undefined
        ? existing.amount
        : yield* requirePositive(input.amount, "Goal amount");
    const currencyAssetId = input.currencyAssetId ?? existing.currency_asset_id;
    yield* assertCash(currencyAssetId);
    const targetDate = yield* requireTargetDate(
      input.targetDate === undefined ? existing.target_date : input.targetDate,
    );
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`UPDATE goals SET name = ${name}, amount = ${amount},
      currency_asset_id = ${currencyAssetId}, target_date = ${targetDate}, updated_at = ${nowIso()}
      WHERE id = ${id}`);
    if (input.accountIds !== undefined) {
      yield* replaceGoalAccounts(id, input.accountIds);
    }
    return yield* getGoal(id);
  });

export const deleteGoal = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* getGoalRow(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM goals WHERE id = ${id}`);
  });
