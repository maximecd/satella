import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  Account,
  CreatePositionInput,
  FinanceApiError,
  PositionEdit,
  UpdatePositionInput,
} from "../contracts.js";

export class PositionService extends Context.Service<
  PositionService,
  {
    readonly create: (input: CreatePositionInput) => Effect.Effect<Account, FinanceApiError>;
    readonly update: (
      id: string,
      input: UpdatePositionInput,
    ) => Effect.Effect<Account, FinanceApiError>;
    readonly getEdit: (id: string) => Effect.Effect<PositionEdit, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/PositionService") {}
