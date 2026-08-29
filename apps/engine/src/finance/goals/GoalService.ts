import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { CreateGoalInput, FinanceApiError, Goal, UpdateGoalInput } from "../contracts.js";

export class GoalService extends Context.Service<
  GoalService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<Goal>, FinanceApiError>;
    readonly get: (id: string) => Effect.Effect<Goal, FinanceApiError>;
    readonly create: (input: CreateGoalInput) => Effect.Effect<Goal, FinanceApiError>;
    readonly update: (id: string, input: UpdateGoalInput) => Effect.Effect<Goal, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/GoalService") {}
