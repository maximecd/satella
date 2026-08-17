import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  AverageUnitPurchasePriceInput,
  ExistingOrNewAccount,
  GenericAssetCategory,
  IdentifierInput,
  SearchableAssetCategory,
} from "../contracts.js";
import { FinanceApiError as FinanceError } from "../contracts.js";
import { getAccount } from "../accounts/AccountSql.js";
import { findByStrongIdentifier, getAsset } from "../assets/AssetSql.js";
import {
  assertCash,
  databaseFailure,
  db,
  failure,
  nowIso,
  requireFinite,
  requirePositive,
  requireNonEmpty,
  usdAssetId,
  type FinanceEffect,
} from "../internal/sql.js";

export const assertManualAccount = (account: Account) => {
  if (account.connectionId !== null) {
    return Effect.fail(failure("read_only", "Only manual accounts can receive holdings"));
  }
  return Effect.succeed(account);
};

export const insertManualAccount = (name: string, currencyId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* sql`INSERT INTO accounts
      (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
      VALUES (${id}, NULL, ${name}, ${currencyId}, NULL, ${timestamp}, ${timestamp})`;
    return id;
  });

export const resolveManualAccountId = (input: ExistingOrNewAccount) =>
  Effect.gen(function* () {
    if (input.type === "existing") {
      const account = yield* getAccount(input.id);
      yield* assertManualAccount(account);
      return account.id;
    }
    const name = yield* requireNonEmpty(input.name, "Account name");
    const currencyId = input.baseCurrencyAssetId ?? (yield* usdAssetId);
    yield* assertCash(currencyId);
    return yield* insertManualAccount(name, currencyId);
  });

export const resolveProviderAssetId = (input: {
  readonly assetCategory: SearchableAssetCategory;
  readonly name: string;
  readonly symbol: string;
  readonly identifiers: ReadonlyArray<IdentifierInput>;
}) =>
  Effect.gen(function* () {
    const existingId = yield* findByStrongIdentifier(input.identifiers);
    if (existingId !== undefined) {
      const asset = yield* getAsset(existingId);
      if (asset.assetCategory !== input.assetCategory) {
        return yield* Effect.fail(
          failure("validation", "The selected asset does not match this category"),
        );
      }
      return asset.id;
    }
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    const name = yield* requireNonEmpty(input.name, "Asset name");
    yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
      VALUES (${id}, ${input.assetCategory}, ${name}, ${input.symbol.trim()}, ${timestamp}, ${timestamp})`;
    for (const identifier of input.identifiers) {
      yield* sql`INSERT INTO asset_identifiers
        (id, asset_id, identifier_type, identifier_value)
        VALUES (${randomUUID()}, ${id}, ${identifier.type.trim()}, ${identifier.value.trim()})`;
    }
    return id;
  });

const normalizeAverageUnitPurchasePrice = (input: AverageUnitPurchasePriceInput | undefined) =>
  Effect.gen(function* () {
    if (input === undefined) return undefined;
    const price = yield* requirePositive(input.price, "Average unit purchase price");
    yield* assertCash(input.currencyAssetId);
    return { price, currencyAssetId: input.currencyAssetId };
  });

export const upsertAbsolutePosition = (
  accountId: string,
  assetId: string,
  quantity: string,
  averageUnitPurchasePrice?: { readonly price: string; readonly currencyAssetId: string },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const timestamp = nowIso();
    const existing = yield* sql<{ readonly id: string }>`SELECT id FROM positions
      WHERE account_id = ${accountId} AND asset_id = ${assetId}`;
    if (existing[0] === undefined) {
      yield* sql`INSERT INTO positions
        (id, account_id, asset_id, quantity, manual_average_unit_purchase_price,
         manual_purchase_currency_asset_id, created_at, updated_at)
        VALUES (${randomUUID()}, ${accountId}, ${assetId}, ${quantity},
          ${averageUnitPurchasePrice?.price ?? null},
          ${averageUnitPurchasePrice?.currencyAssetId ?? null}, ${timestamp}, ${timestamp})`;
      return "created" as const;
    }
    yield* sql`UPDATE positions SET quantity = ${quantity}, updated_at = ${timestamp}
      WHERE id = ${existing[0].id}`;
    if (averageUnitPurchasePrice !== undefined) {
      yield* sql`UPDATE positions SET manual_average_unit_purchase_price = ${averageUnitPurchasePrice.price},
        manual_purchase_currency_asset_id = ${averageUnitPurchasePrice.currencyAssetId},
        updated_at = ${timestamp} WHERE id = ${existing[0].id}`;
    }
    return "updated" as const;
  });

export const listManualAccounts = (): FinanceEffect<ReadonlyArray<Account>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly id: string }>`SELECT id FROM accounts
        WHERE connection_id IS NULL ORDER BY created_at, id`,
    );
    return yield* Effect.forEach(rows, ({ id }) => getAccount(id));
  });

export const lookupManualHolding = (
  accountId: string,
  identifierType: string,
  identifierValue: string,
): FinanceEffect<{ readonly assetId: string | null; readonly quantity: string | null }> =>
  Effect.gen(function* () {
    const account = yield* getAccount(accountId);
    yield* assertManualAccount(account);
    const sql = yield* SqlClient.SqlClient;
    const matched = yield* db(sql<{
      readonly asset_id: string;
    }>`SELECT asset_id FROM asset_identifiers
      WHERE identifier_type = ${identifierType.trim()} AND identifier_value = ${identifierValue.trim()}`);
    const assetId = matched[0]?.asset_id;
    if (assetId === undefined) return { assetId: null, quantity: null };
    const position = account.positions.find((item) => item.assetId === assetId);
    return { assetId, quantity: position?.quantity ?? null };
  });

const toAddAssetsResult = (
  account: Account,
  positionOutcome: "created" | "updated",
): AddAssetsResult => ({
  accountId: account.id,
  accountName: account.name,
  positionOutcome,
});

export const addManualHolding = (input: AddManualHoldingInput): FinanceEffect<AddAssetsResult> =>
  Effect.gen(function* () {
    const quantity = yield* requireFinite(input.quantity, "Quantity");
    const average = yield* normalizeAverageUnitPurchasePrice(input.averageUnitPurchasePrice);
    const sql = yield* SqlClient.SqlClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const assetId = yield* resolveProviderAssetId(input.asset);
          const accountId = yield* resolveManualAccountId(input.account);
          const positionOutcome = yield* upsertAbsolutePosition(
            accountId,
            assetId,
            quantity,
            average,
          );
          return toAddAssetsResult(yield* getAccount(accountId), positionOutcome);
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          cause instanceof FinanceError ? cause : databaseFailure(cause),
        ),
        Effect.catchDefect((cause) => Effect.fail(databaseFailure(cause))),
      );
  });

export const addCashAccount = (input: AddCashAccountInput): FinanceEffect<AddAssetsResult> =>
  Effect.gen(function* () {
    const balance = yield* requireFinite(input.balance, "Balance");
    yield* assertCash(input.currencyAssetId);
    const sql = yield* SqlClient.SqlClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const accountId =
            input.account.type === "existing"
              ? yield* resolveManualAccountId(input.account)
              : yield* resolveManualAccountId({
                  type: "new",
                  name: input.account.name,
                  baseCurrencyAssetId: input.account.baseCurrencyAssetId ?? input.currencyAssetId,
                });
          const positionOutcome = yield* upsertAbsolutePosition(
            accountId,
            input.currencyAssetId,
            balance,
          );
          return toAddAssetsResult(yield* getAccount(accountId), positionOutcome);
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          cause instanceof FinanceError ? cause : databaseFailure(cause),
        ),
        Effect.catchDefect((cause) => Effect.fail(databaseFailure(cause))),
      );
  });

export const addOtherAsset = (input: AddOtherAssetInput): FinanceEffect<AddAssetsResult> =>
  Effect.gen(function* () {
    const value = yield* requireFinite(input.value, "Current value");
    const average = yield* normalizeAverageUnitPurchasePrice(input.averageUnitPurchasePrice);
    yield* assertCash(input.currencyAssetId);
    const name = yield* requireNonEmpty(input.name, "Asset name");
    const category: GenericAssetCategory = input.category ?? "other";
    const sql = yield* SqlClient.SqlClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const assetId = randomUUID();
          const timestamp = nowIso();
          yield* sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
            VALUES (${assetId}, ${category}, ${name}, NULL, ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO asset_prices
            (asset_id, price, currency_asset_id, source, observed_at, updated_at)
            VALUES (${assetId}, ${value}, ${input.currencyAssetId}, 'manual', ${timestamp}, ${timestamp})`;
          const accountId = yield* resolveManualAccountId(input.account);
          const positionOutcome = yield* upsertAbsolutePosition(accountId, assetId, "1", average);
          return toAddAssetsResult(yield* getAccount(accountId), positionOutcome);
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          cause instanceof FinanceError ? cause : databaseFailure(cause),
        ),
        Effect.catchDefect((cause) => Effect.fail(databaseFailure(cause))),
      );
  });
