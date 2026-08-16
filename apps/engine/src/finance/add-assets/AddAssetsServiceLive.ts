import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./AddAssetsSql.js";
import { AddAssetsService } from "./AddAssetsService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return AddAssetsService.of({
    listManualAccounts: Effect.fn("AddAssetsService.listManualAccounts")(() =>
      withSql(Operations.listManualAccounts()),
    ),
    lookupManualHolding: Effect.fn("AddAssetsService.lookupManualHolding")(
      (accountId, identifierType, identifierValue) =>
        withSql(Operations.lookupManualHolding(accountId, identifierType, identifierValue)),
    ),
    addManualHolding: Effect.fn("AddAssetsService.addManualHolding")((input) =>
      withSql(Operations.addManualHolding(input)),
    ),
    addCashAccount: Effect.fn("AddAssetsService.addCashAccount")((input) =>
      withSql(Operations.addCashAccount(input)),
    ),
    addOtherAsset: Effect.fn("AddAssetsService.addOtherAsset")((input) =>
      withSql(Operations.addOtherAsset(input)),
    ),
  });
});

export const layer = Layer.effect(AddAssetsService, make);
