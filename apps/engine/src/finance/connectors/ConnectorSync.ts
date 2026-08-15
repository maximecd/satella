import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { FinanceApiError } from "../contracts.js";
import * as ConnectorService from "../connector-service.js";
import { connectorSyncFailure } from "../connections/ConnectionSql.js";
import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
export class ConnectorSync extends Context.Service<
  ConnectorSync,
  {
    readonly syncRegistered: (
      connectionId: string,
      connectorId: string,
      credentials: unknown,
    ) => Effect.Effect<void, FinanceApiError>;
  }
>()("@optimus/engine/finance/ConnectorSync") {}

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const http = yield* HttpClient.HttpClient;
  return ConnectorSync.of({
    syncRegistered: Effect.fn("ConnectorSync.syncRegistered")(
      (connectionId, connectorId, credentials) =>
        ConnectorService.syncRegisteredConnector(connectionId, connectorId, credentials).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.provideService(HttpClient.HttpClient, http),
          Effect.mapError(connectorSyncFailure),
          Effect.asVoid,
        ),
    ),
  });
});

export const layer = Layer.effect(ConnectorSync, make);
