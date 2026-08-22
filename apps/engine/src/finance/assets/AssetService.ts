import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  Asset,
  CreateAssetInput,
  FinanceApiError,
  MaintainAssetInput,
  SetManualPriceInput,
  UpdateCustomAssetInput,
} from "../contracts.js";

export class AssetService extends Context.Service<
  AssetService,
  {
    readonly get: (id: string) => Effect.Effect<Asset, FinanceApiError>;
    readonly list: () => Effect.Effect<ReadonlyArray<Asset>, FinanceApiError>;
    readonly create: (input: CreateAssetInput) => Effect.Effect<Asset, FinanceApiError>;
    readonly updateCustom: (
      id: string,
      input: UpdateCustomAssetInput,
    ) => Effect.Effect<Asset, FinanceApiError>;
    readonly maintain: (
      id: string,
      input: MaintainAssetInput,
    ) => Effect.Effect<Asset, FinanceApiError>;
    readonly setManualPrice: (
      id: string,
      input: SetManualPriceInput,
    ) => Effect.Effect<Asset, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/AssetService") {}
