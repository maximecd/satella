import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { CreateDebtInput, Debt, FinanceApiError, UpdateDebtInput } from "../contracts.js";

export class DebtService extends Context.Service<
  DebtService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<Debt>, FinanceApiError>;
    readonly get: (id: string) => Effect.Effect<Debt, FinanceApiError>;
    readonly create: (input: CreateDebtInput) => Effect.Effect<Debt, FinanceApiError>;
    readonly update: (id: string, input: UpdateDebtInput) => Effect.Effect<Debt, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/DebtService") {}
