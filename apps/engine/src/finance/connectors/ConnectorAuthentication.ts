import { randomUUID } from "node:crypto";

import {
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  type InteractiveConnectorAuthentication,
} from "@satella-app/connector-core";
import {
  TradeRepublicBrowserRuntime,
  type TradeRepublicBrowserStartInput,
} from "@satella-app/connector-trade-republic";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";

import type {
  ConnectorAuthenticationAttempt,
  ConnectorCredentials,
  Custodian,
  FinanceApiError,
  StartConnectorAuthenticationInput,
} from "../contracts.js";
import { FinanceApiError as FinanceError } from "../contracts.js";
import * as ConnectorService from "../connector-service.js";
import {
  connectorSyncFailure,
  deleteCustodian,
  getCustodian,
  insertSyncedCustodian,
} from "../custodians/CustodianSql.js";
import { ConnectorCatalog } from "./ConnectorCatalog.js";
import { makeWithVaultSql } from "../with-vault-sql.js";
import { VaultEvents } from "../../vault/VaultEvents.js";
import { VaultService } from "../../vault/Vault.js";
import { VaultStateError } from "../../vault/errors.js";
import { db, failure, firstOrNotFound, nowIso } from "../internal/sql.js";
import { RefreshQueue } from "../refresh/RefreshQueue.js";

interface PendingAuthentication {
  readonly connectorId: string;
  readonly name: string;
  readonly custodianId?: string;
  readonly flow: InteractiveConnectorAuthentication<never>;
}

const vaultError = (cause: unknown): FinanceApiError =>
  cause instanceof VaultStateError
    ? new FinanceError({
        code: cause.reason === "screen-locked" ? "screen_locked" : "vault_closed",
        message: cause.message,
      })
    : failure("vault_closed", "The Vault is closed.");

const authenticationError = (cause: unknown): FinanceApiError => {
  if (cause instanceof FinanceError) return cause;
  if (cause instanceof ConnectorAuthenticationError) {
    const detail = cause.message.trim();
    const withDetail = (message: string) =>
      detail.length === 0 || detail === message ? message : `${message}: ${detail}`;
    if (cause.category === "invalid_credentials")
      return failure("validation", withDetail("Authentication was rejected"));
    if (cause.category === "timeout")
      return failure("validation", withDetail("Authentication timed out"));
    if (cause.category === "rate_limit")
      return failure(
        "validation",
        withDetail("The connector rate limit was reached; try again later"),
      );
    if (cause.category === "network")
      return failure("validation", withDetail("The connector network request failed"));
    return failure(
      "validation",
      withDetail("The connector returned an invalid authentication response"),
    );
  }
  return failure(
    "validation",
    cause instanceof Error && cause.message.length > 0
      ? `Connector authentication failed: ${cause.message}`
      : "Connector authentication failed",
  );
};

const publicAttempt = (
  attemptId: string,
  pending: PendingAuthentication,
): ConnectorAuthenticationAttempt => ({
  attemptId,
  challenge: pending.flow.challenge,
});

/** Owns interactive connector attempts and keeps their browser-backed state out of the API. */
export class ConnectorAuthenticationService extends Context.Service<
  ConnectorAuthenticationService,
  {
    readonly start: (
      input: StartConnectorAuthenticationInput,
    ) => Effect.Effect<ConnectorAuthenticationAttempt, FinanceApiError>;
    readonly submit: (attemptId: string, code: string) => Effect.Effect<Custodian, FinanceApiError>;
    readonly cancel: (attemptId: string) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/ConnectorAuthenticationService") {}

export const make = Effect.gen(function* () {
  const catalog = yield* ConnectorCatalog;
  const http = yield* HttpClient.HttpClient;
  const vault = yield* VaultService;
  const events = yield* VaultEvents;
  const refreshQueue = yield* RefreshQueue;
  const withSql = yield* makeWithVaultSql;
  const pending = yield* Ref.make(new Map<string, PendingAuthentication>());

  const cancelPending = (entry: PendingAuthentication) => entry.flow.cancel().pipe(Effect.ignore);

  const cancelAll = Ref.get(pending).pipe(
    Effect.flatMap((entries) => Effect.forEach(entries.values(), cancelPending)),
    Effect.andThen(Ref.set(pending, new Map())),
  );

  yield* Effect.addFinalizer(() => cancelAll);
  yield* Effect.forkScoped(Effect.forever(events.awaitClosed().pipe(Effect.andThen(cancelAll))));

  const start = (
    input: StartConnectorAuthenticationInput,
  ): Effect.Effect<ConnectorAuthenticationAttempt, FinanceApiError> =>
    Effect.gen(function* () {
      // Authentication is a Vault-owned operation even before a database write.
      yield* vault.currentSql().pipe(Effect.mapError(vaultError), Effect.asVoid);
      const connector = catalog.get(input.connectorId);
      if (connector === undefined) {
        return yield* Effect.fail(
          failure("connector_unavailable", "No registered connector matches this selection"),
        );
      }
      if (connector.startAuthentication === undefined) {
        return yield* Effect.fail(
          failure("validation", "This connector does not support interactive authentication"),
        );
      }
      const active = yield* Ref.get(pending);
      if (active.size > 0) {
        return yield* Effect.fail(
          failure("conflict", "Another connector authentication is already in progress"),
        );
      }

      // SAFETY: the catalog's connector credential schema validates this payload at the connector boundary.
      const operation = connector.startAuthentication(
        input.credentials as ConnectorCredentials,
      ) as Effect.Effect<
        InteractiveConnectorAuthentication<never>,
        ConnectorAuthenticationError,
        HttpClient.HttpClient | TradeRepublicBrowserRuntime
      >;
      const runtime = yield* Effect.serviceOption(TradeRepublicBrowserRuntime);
      const runtimeValue = Option.isSome(runtime)
        ? runtime.value
        : {
            start: (_input: TradeRepublicBrowserStartInput) =>
              Effect.fail(
                new ConnectorAuthenticationError({
                  category: "network",
                  message: "The browser authentication runtime is unavailable",
                }),
              ),
          };
      // SAFETY: the selected connector's authentication operation has the two services supplied below.
      const operationWithServices = operation.pipe(
        Effect.provideService(HttpClient.HttpClient, http),
        Effect.provideService(TradeRepublicBrowserRuntime, runtimeValue),
      ) as Effect.Effect<InteractiveConnectorAuthentication<never>, ConnectorAuthenticationError>;
      const flow = yield* operationWithServices.pipe(Effect.mapError(authenticationError));
      const entry: PendingAuthentication = {
        connectorId: input.connectorId,
        name: input.name,
        flow,
      };
      if (input.custodianId !== undefined) Object.assign(entry, { custodianId: input.custodianId });
      const attemptId = randomUUID();
      yield* Ref.set(pending, new Map([[attemptId, entry]]));
      return publicAttempt(attemptId, entry);
    });

  const submit = (attemptId: string, code: string) =>
    Effect.gen(function* () {
      const entry = (yield* Ref.get(pending)).get(attemptId);
      if (entry === undefined)
        return yield* Effect.fail(failure("not_found", "Authentication attempt was not found"));
      const authenticated = yield* entry.flow.submit(code).pipe(
        Effect.mapError(authenticationError),
        Effect.tapError(() =>
          Ref.update(pending, (entries) => {
            const next = new Map(entries);
            next.delete(attemptId);
            return next;
          }).pipe(Effect.andThen(entry.flow.cancel())),
        ),
      );
      yield* Ref.update(pending, (entries) => {
        const next = new Map(entries);
        next.delete(attemptId);
        return next;
      });
      const session = authenticated.session;
      if (session === undefined || Object.keys(session).length === 0) {
        return yield* Effect.fail(
          failure("validation", "Authentication did not return a durable session"),
        );
      }

      const existingCustodianId = entry.custodianId;
      const custodianId = yield* withSql(
        existingCustodianId === undefined
          ? insertSyncedCustodian(entry.name, entry.connectorId, session)
          : Effect.gen(function* () {
              const sql = yield* SqlClient.SqlClient;
              const row = yield* firstOrNotFound(
                yield* db(
                  sql<{
                    readonly connector_id: string | null;
                  }>`SELECT connector_id FROM custodians WHERE id = ${existingCustodianId}`,
                ),
                "Custodian",
              );
              if (row.connector_id !== entry.connectorId) {
                return yield* Effect.fail(
                  failure("validation", "The selected Custodian uses a different connector"),
                );
              }
              return existingCustodianId;
            }),
      );

      const persistSession = (nextSession: Readonly<Record<string, string>>) =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* db(
            sql`UPDATE custodians SET config_json = ${JSON.stringify(nextSession)},
              last_refresh_attempt_at = ${nowIso()}, updated_at = ${nowIso()} WHERE id = ${custodianId}`,
          );
        });
      // SAFETY: withSql supplies the SQL service required by this authenticated sync effect.
      const rawSync = ConnectorService.syncAuthenticatedConnector(custodianId, authenticated, {
        onSession: persistSession,
      }).pipe(Effect.provideService(HttpClient.HttpClient, http)) as Effect.Effect<
        ConnectorService.ConnectorSyncResult,
        ConnectorService.ConnectorSyncError,
        SqlClient.SqlClient
      >;
      yield* refreshQueue.submit(
        `connector-authentication:${custodianId}`,
        withSql(
          rawSync.pipe(
            Effect.catch((error) => {
              const requiresReauthentication =
                error instanceof ConnectorFetchAccountsError &&
                error.category === "authentication_expired";
              const mark =
                existingCustodianId !== undefined && requiresReauthentication
                  ? Effect.gen(function* () {
                      const sql = yield* SqlClient.SqlClient;
                      yield* db(
                        sql`UPDATE custodians SET sync_state = 'reauthentication_required', updated_at = ${nowIso()}
                        WHERE id = ${custodianId}`,
                      );
                    })
                  : Effect.void;
              const cleanup =
                existingCustodianId === undefined
                  ? deleteCustodian(custodianId).pipe(Effect.ignore)
                  : Effect.void;
              return mark.pipe(
                Effect.andThen(cleanup),
                Effect.andThen(Effect.fail(connectorSyncFailure(error))),
              );
            }),
          ),
        ),
      );
      return yield* withSql(getCustodian(custodianId));
    });

  const cancel = (attemptId: string) =>
    Effect.gen(function* () {
      const entry = (yield* Ref.get(pending)).get(attemptId);
      if (entry === undefined)
        return yield* Effect.fail(failure("not_found", "Authentication attempt was not found"));
      yield* Ref.update(pending, (entries) => {
        const next = new Map(entries);
        next.delete(attemptId);
        return next;
      });
      yield* entry.flow.cancel();
    });

  return ConnectorAuthenticationService.of({ start, submit, cancel });
});

export const layer = Layer.effect(ConnectorAuthenticationService, make);
