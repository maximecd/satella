import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  Account,
  CreateAccountInput,
  FinanceApiError,
  UpdateAccountInput,
} from "../contracts.js";

export class AccountService extends Context.Service<
  AccountService,
  {
    readonly get: (id: string) => Effect.Effect<Account, FinanceApiError>;
    readonly create: (input: CreateAccountInput) => Effect.Effect<Account, FinanceApiError>;
    readonly update: (
      id: string,
      input: UpdateAccountInput,
    ) => Effect.Effect<Account, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@optimus/engine/finance/AccountService") {}
