import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  ConnectConnectionInput,
  Connection,
  ConnectionRefreshResult,
  FinanceApiError,
  UpdateConnectionInput,
} from "../contracts.js";

export class ConnectionService extends Context.Service<
  ConnectionService,
  {
    readonly get: (id: string) => Effect.Effect<Connection, FinanceApiError>;
    readonly list: () => Effect.Effect<ReadonlyArray<Connection>, FinanceApiError>;
    readonly connect: (input: ConnectConnectionInput) => Effect.Effect<Connection, FinanceApiError>;
    readonly refresh: (id: string) => Effect.Effect<ConnectionRefreshResult, FinanceApiError>;
    readonly update: (
      id: string,
      input: UpdateConnectionInput,
    ) => Effect.Effect<Connection, FinanceApiError>;
    readonly delete: (id: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@optimus/engine/finance/ConnectionService") {}
