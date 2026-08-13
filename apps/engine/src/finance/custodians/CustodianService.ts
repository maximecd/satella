import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  ConnectCustodianInput,
  CreateCustodianInput,
  Custodian,
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
    readonly resync: (id: string) => Effect.Effect<Custodian, FinanceApiError>;
    readonly update: (
      id: string,
      input: UpdateCustodianInput,
    ) => Effect.Effect<Custodian, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@optimus/engine/finance/CustodianService") {}
