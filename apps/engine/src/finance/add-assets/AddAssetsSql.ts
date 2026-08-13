import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import type {
  AccountKind,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Custodian,
  IdentifierInput,
} from "../contracts.js";
import { FinanceApiError as FinanceError } from "../contracts.js";
import { getAccount } from "../accounts/AccountSql.js";
import { findByStrongIdentifier, getAsset } from "../assets/AssetSql.js";
import { getCustodian, listCustodians } from "../custodians/CustodianSql.js";
import {
  assertFiat,
  databaseFailure,
  db,
  failure,
  nowIso,
  requireFinite,
  requireNonEmpty,
  usdAssetId,
  type FinanceEffect,
} from "../internal/sql.js";

export const holdingAccountKind = (assetClass: "security" | "crypto"): AccountKind =>
  assetClass === "security" ? "securities" : "crypto";

export const assertManualCustodian = (custodian: Custodian) => {
  if (custodian.managementMode !== "manual") {
    return Effect.fail(failure("read_only", "Connector-managed custodians are read-only"));
  }
  if (custodian.presentationRole !== null) {
    return Effect.fail(
      failure("read_only", "System-managed custodians cannot be selected in manual workflows"),
    );
  }
  return Effect.succeed(custodian);
};

export const insertManualCustodian = (name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
      VALUES (${id}, ${name}, 'manual', ${timestamp}, ${timestamp})`;
    return id;
  });

export const insertManualAccount = (
  custodianId: string,
  name: string,
  accountKind: AccountKind,
  currencyId: string,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* sql`INSERT INTO accounts
      (id, custodian_id, name, account_kind, base_currency_asset_id, connector_account_id, created_at, updated_at)
      VALUES (${id}, ${custodianId}, ${name}, ${accountKind}, ${currencyId}, NULL, ${timestamp}, ${timestamp})`;
    return id;
  });

export const resolveManualCustodianId = (input: {
  readonly type: "existing" | "new";
  readonly id?: string;
  readonly name?: string;
}) =>
  Effect.gen(function* () {
    if (input.type === "existing") {
      const custodian = yield* getCustodian(input.id!);
      yield* assertManualCustodian(custodian);
      return custodian.id;
    }
    const name = yield* requireNonEmpty(input.name ?? "", "Custodian name");
    return yield* insertManualCustodian(name);
  });

export const resolveProviderAssetId = (input: {
  readonly assetClass: "security" | "crypto";
  readonly name: string;
  readonly symbol: string;
  readonly identifiers: ReadonlyArray<IdentifierInput>;
}) =>
  Effect.gen(function* () {
    const existingId = yield* findByStrongIdentifier(input.identifiers);
    if (existingId !== undefined) {
      const asset = yield* getAsset(existingId);
      if (asset.assetClass !== input.assetClass) {
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
    yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
      VALUES (${id}, ${input.assetClass}, ${name}, ${input.symbol.trim()}, ${timestamp}, ${timestamp})`;
    for (const identifier of input.identifiers) {
      yield* sql`INSERT INTO asset_identifiers
        (id, asset_id, identifier_type, identifier_value)
        VALUES (${randomUUID()}, ${id}, ${identifier.type.trim()}, ${identifier.value.trim()})`;
    }
    return id;
  });

export const upsertAbsolutePosition = (accountId: string, assetId: string, quantity: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const timestamp = nowIso();
    const existing = yield* sql<{ readonly id: string }>`SELECT id FROM positions
      WHERE account_id = ${accountId} AND asset_id = ${assetId}`;
    if (existing[0] === undefined) {
      yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
        VALUES (${randomUUID()}, ${accountId}, ${assetId}, ${quantity}, ${timestamp}, ${timestamp})`;
      return "created" as const;
    }
    yield* sql`UPDATE positions SET quantity = ${quantity}, updated_at = ${timestamp}
      WHERE id = ${existing[0].id}`;
    return "updated" as const;
  });

export const listManualCustodians = (): FinanceEffect<ReadonlyArray<Custodian>> =>
  listCustodians().pipe(
    Effect.map((custodians) =>
      custodians.filter(
        (custodian) => custodian.managementMode === "manual" && custodian.presentationRole === null,
      ),
    ),
  );

export const lookupManualHolding = (
  accountId: string,
  identifierType: string,
  identifierValue: string,
): FinanceEffect<{ readonly assetId: string | null; readonly quantity: number | null }> =>
  Effect.gen(function* () {
    const account = yield* getAccount(accountId);
    yield* assertManualCustodian(yield* getCustodian(account.custodianId));
    if (account.presentationRole !== null) {
      return yield* Effect.fail(
        failure("read_only", "System-managed accounts cannot be selected in manual workflows"),
      );
    }
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

export const addManualHolding = (input: AddManualHoldingInput): FinanceEffect<AddAssetsResult> =>
  Effect.gen(function* () {
    yield* requireFinite(input.quantity, "Quantity");
    const expectedKind = holdingAccountKind(input.asset.assetClass);
    const sql = yield* SqlClient.SqlClient;
    const result = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const assetId = yield* resolveProviderAssetId(input.asset);
          const custodianId = yield* resolveManualCustodianId(input.custodian);
          let accountId: string;
          if (input.account.type === "existing") {
            const account = yield* getAccount(input.account.id);
            if (account.custodianId !== custodianId) {
              return yield* Effect.fail(
                failure("validation", "The selected account does not belong to that institution"),
              );
            }
            if (account.accountKind !== expectedKind) {
              return yield* Effect.fail(
                failure("validation", "The selected account is not compatible with this asset"),
              );
            }
            if (account.managementMode !== "manual" || account.presentationRole !== null) {
              return yield* Effect.fail(
                failure("read_only", "Only manual accounts can receive holdings"),
              );
            }
            accountId = account.id;
          } else {
            const name = yield* requireNonEmpty(input.account.name, "Account name");
            const currencyId = input.account.baseCurrencyAssetId ?? (yield* usdAssetId);
            yield* assertFiat(currencyId);
            accountId = yield* insertManualAccount(custodianId, name, expectedKind, currencyId);
          }
          const positionOutcome = yield* upsertAbsolutePosition(accountId, assetId, input.quantity);
          const account = yield* getAccount(accountId);
          return {
            accountId: account.id,
            custodianId: account.custodianId,
            accountName: account.name,
            positionOutcome,
          };
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          cause instanceof FinanceError ? cause : databaseFailure(cause),
        ),
        Effect.catchDefect((cause) => Effect.fail(databaseFailure(cause))),
      );
    return result;
  });

export const addCashAccount = (input: AddCashAccountInput): FinanceEffect<AddAssetsResult> =>
  Effect.gen(function* () {
    yield* requireFinite(input.balance, "Balance");
    yield* assertFiat(input.currencyAssetId);
    const sql = yield* SqlClient.SqlClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const custodianId = yield* resolveManualCustodianId(input.custodian);
          const name = yield* requireNonEmpty(input.accountName, "Account name");
          const accountId = yield* insertManualAccount(
            custodianId,
            name,
            input.accountKind,
            input.currencyAssetId,
          );
          yield* upsertAbsolutePosition(accountId, input.currencyAssetId, input.balance);
          const account = yield* getAccount(accountId);
          return {
            accountId: account.id,
            custodianId: account.custodianId,
            accountName: account.name,
            positionOutcome: "created" as const,
          };
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          cause instanceof FinanceError ? cause : databaseFailure(cause),
        ),
        Effect.catchDefect((cause) => Effect.fail(databaseFailure(cause))),
      );
  });

export const ensureDirectOwnershipAccount = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const existing = yield* sql<{
      readonly custodian_id: string;
      readonly account_id: string;
    }>`SELECT c.id AS custodian_id, a.id AS account_id
      FROM custodians c JOIN accounts a ON a.custodian_id = c.id
      WHERE c.presentation_role = 'direct_ownership' AND a.presentation_role = 'direct_ownership'
      ORDER BY c.created_at, a.created_at LIMIT 1`;
    if (existing[0] !== undefined) return existing[0];
    const timestamp = nowIso();
    const custodianId = randomUUID();
    const accountId = randomUUID();
    const currencyId = yield* usdAssetId;
    yield* sql`INSERT INTO custodians
      (id, name, management_mode, presentation_role, created_at, updated_at)
      VALUES (${custodianId}, 'Direct ownership', 'manual', 'direct_ownership', ${timestamp}, ${timestamp})`;
    yield* sql`INSERT INTO accounts
      (id, custodian_id, name, account_kind, presentation_role, base_currency_asset_id, connector_account_id, created_at, updated_at)
      VALUES (${accountId}, ${custodianId}, 'Other assets', 'other', 'direct_ownership', ${currencyId}, NULL, ${timestamp}, ${timestamp})`;
    return { custodian_id: custodianId, account_id: accountId };
  });

export const addOtherAsset = (input: AddOtherAssetInput): FinanceEffect<AddAssetsResult> =>
  Effect.gen(function* () {
    yield* requireFinite(input.value, "Current value");
    yield* assertFiat(input.currencyAssetId);
    const name = yield* requireNonEmpty(input.name, "Asset name");
    const sql = yield* SqlClient.SqlClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const assetId = randomUUID();
          const timestamp = nowIso();
          yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
            VALUES (${assetId}, 'custom', ${name}, NULL, ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO asset_prices
            (asset_id, price, currency_asset_id, source, observed_at, updated_at)
            VALUES (${assetId}, ${input.value}, ${input.currencyAssetId}, 'manual', ${timestamp}, ${timestamp})`;
          const destination = yield* ensureDirectOwnershipAccount();
          yield* upsertAbsolutePosition(destination.account_id, assetId, 1);
          return {
            accountId: destination.account_id,
            custodianId: destination.custodian_id,
            accountName: "Other assets",
            positionOutcome: "created" as const,
          };
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          cause instanceof FinanceError ? cause : databaseFailure(cause),
        ),
        Effect.catchDefect((cause) => Effect.fail(databaseFailure(cause))),
      );
  });
