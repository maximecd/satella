import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { FinanceApiError } from "../contracts.js";
import * as ConnectorService from "../connector-service.js";
import { connectorSyncFailure } from "../connections/ConnectionSql.js";
import { HttpClient } from "effect/unstable/http";
import { makeWithVaultSql } from "../with-vault-sql.js";
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
  const http = yield* HttpClient.HttpClient;
  const withSql = yield* makeWithVaultSql;
  return ConnectorSync.of({
    syncRegistered: Effect.fn("ConnectorSync.syncRegistered")(
      (connectionId, connectorId, credentials) =>
        withSql(
          ConnectorService.syncRegisteredConnector(connectionId, connectorId, credentials).pipe(
            Effect.provideService(HttpClient.HttpClient, http),
            Effect.mapError(connectorSyncFailure),
            Effect.asVoid,
          ),
        ),
    ),
  });
});

export const layer = Layer.effect(ConnectorSync, make);
