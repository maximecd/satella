import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  FinanceApiError,
} from "../contracts.js";

export class AddAssetsService extends Context.Service<
  AddAssetsService,
  {
    readonly listManualAccounts: () => Effect.Effect<ReadonlyArray<Account>, FinanceApiError>;
    readonly lookupManualHolding: (
      accountId: string,
      identifierType: string,
      identifierValue: string,
    ) => Effect.Effect<
      { readonly assetId: string | null; readonly quantity: string | null },
      FinanceApiError
    >;
    readonly addManualHolding: (
      input: AddManualHoldingInput,
    ) => Effect.Effect<AddAssetsResult, FinanceApiError>;
    readonly addCashAccount: (
      input: AddCashAccountInput,
    ) => Effect.Effect<AddAssetsResult, FinanceApiError>;
    readonly addOtherAsset: (
      input: AddOtherAssetInput,
    ) => Effect.Effect<AddAssetsResult, FinanceApiError>;
  }
>()("@optimus/engine/finance/AddAssetsService") {}
