import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  ConnectCustodianInput,
  CreateCustodianInput,
  Custodian,
  CustodianRefreshResult,
  FinanceApiError,
  UpdateCustodianInput,
} from "../contracts.js";

export class CustodianService extends Context.Service<
  CustodianService,
  {
    readonly get: (id: string) => Effect.Effect<Custodian, FinanceApiError>;
    readonly list: () => Effect.Effect<ReadonlyArray<Custodian>, FinanceApiError>;
    readonly create: (input: CreateCustodianInput) => Effect.Effect<Custodian, FinanceApiError>;
    readonly connect: (input: ConnectCustodianInput) => Effect.Effect<Custodian, FinanceApiError>;
    readonly refresh: (id: string) => Effect.Effect<CustodianRefreshResult, FinanceApiError>;
    readonly update: (
      id: string,
      input: UpdateCustodianInput,
    ) => Effect.Effect<Custodian, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/CustodianService") {}
