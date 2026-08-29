import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

import type { AccountType } from "./contracts.js";
import { createAccount as insertAccount } from "./accounts/AccountSql.js";
import { createCustodian } from "./custodians/CustodianSql.js";
import { nowIso } from "./internal/sql.js";

export * from "./assets/AssetSql.js";
export * from "./custodians/CustodianSql.js";
export {
  assertAccountAcceptsAsset,
  assertManualAccountOwner,
  deleteAccount,
  getAccount,
  loadPosition,
  updateAccount,
} from "./accounts/AccountSql.js";
export { createAccount as createAccountOnCustodian } from "./accounts/AccountSql.js";
export * from "./positions/PositionSql.js";
export * from "./portfolio/PortfolioSql.js";
export * from "./debts/DebtSql.js";
export * from "./goals/GoalSql.js";
export * from "./settings/SettingsSql.js";
export * from "./add-assets/AddAssetsSql.js";

export const createAccount = (input: {
  readonly name: string;
  readonly baseCurrencyAssetId?: string;
  readonly accountType?: AccountType;
  readonly custodianId?: string;
}) =>
  Effect.gen(function* () {
    const custodianId =
      input.custodianId ?? (yield* createCustodian({ name: `${input.name} bank` })).id;
    const created = {
      name: input.name,
      custodianId,
      accountType: input.accountType ?? "brokerage",
    };
    if (input.baseCurrencyAssetId !== undefined) {
      Object.assign(created, { baseCurrencyAssetId: input.baseCurrencyAssetId });
    }
    return yield* insertAccount(created);
  });

export const seedSyncedCustodian = (input: {
  readonly id: string;
  readonly name: string;
  readonly connectorId: string;
  readonly credentials?: unknown;
  readonly accounts?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly connectorAccountId: string;
    readonly accountType?: AccountType;
    readonly baseCurrencyAssetId?: string;
  }>;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const timestamp = nowIso();
    yield* sql`INSERT INTO custodians (id, name, connector_id, config_json, created_at, updated_at)
      VALUES (${input.id}, ${input.name}, ${input.connectorId}, ${JSON.stringify(input.credentials ?? {})}, ${timestamp}, ${timestamp})`;
    for (const account of input.accounts ?? []) {
      yield* sql`INSERT INTO accounts
        (id, custodian_id, name, account_type, base_currency_asset_id, connector_account_id, created_at, updated_at)
        VALUES (${account.id}, ${input.id}, ${account.name}, ${account.accountType ?? "other"}, ${account.baseCurrencyAssetId ?? "fiat:USD"}, ${account.connectorAccountId}, ${timestamp}, ${timestamp})`;
    }
  });
