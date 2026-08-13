import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { Account, CreatePositionInput, FinanceApiError } from "../contracts.js";

export class PositionService extends Context.Service<
  PositionService,
  {
    readonly create: (input: CreatePositionInput) => Effect.Effect<Account, FinanceApiError>;
    readonly update: (id: string, quantity: number) => Effect.Effect<Account, FinanceApiError>;
    readonly getAccount: (id: string) => Effect.Effect<Account, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@optimus/engine/finance/PositionService") {}
