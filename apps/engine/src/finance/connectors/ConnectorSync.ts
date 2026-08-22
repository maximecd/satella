import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { ConnectorCredentials, FinanceApiError } from "../contracts.js";
import * as ConnectorService from "../connector-service.js";
import { connectorSyncFailure } from "../custodians/CustodianSql.js";
import { HttpClient } from "effect/unstable/http";
import { makeWithVaultSql } from "../with-vault-sql.js";
export class ConnectorSync extends Context.Service<
  ConnectorSync,
  {
    readonly syncRegistered: (
      custodianId: string,
      connectorId: string,
      credentials: ConnectorCredentials,
    ) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/ConnectorSync") {}

export const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const withSql = yield* makeWithVaultSql;
  return ConnectorSync.of({
    syncRegistered: Effect.fn("ConnectorSync.syncRegistered")(
      (custodianId, connectorId, credentials) =>
        withSql(
          ConnectorService.syncRegisteredConnector(custodianId, connectorId, credentials).pipe(
            Effect.provideService(HttpClient.HttpClient, http),
            Effect.mapError(connectorSyncFailure),
            Effect.asVoid,
          ),
        ),
    ),
  });
});

export const layer = Layer.effect(ConnectorSync, make);
