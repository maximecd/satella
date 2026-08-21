import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";
import { ConnectorAuthenticationError, ConnectorFetchAccountsError } from "@optimus/connector-core";

import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import type {
  ConnectConnectionInput,
  Connection,
  ConnectorCredentials as ConnectorCredentialsType,
  ConnectionRefreshResult,
  FinanceApiError,
  UpdateConnectionInput,
} from "../contracts.js";
import { ConnectorCredentials, FinanceApiError as FinanceError } from "../contracts.js";
import * as Schema from "effect/Schema";
import { CONNECTOR_CAPABILITIES } from "../config.js";
import { syncRegisteredConnector, type ConnectorSyncError } from "../connector-service.js";
import { refreshPrices } from "../market-data.js";
import { captureSnapshot, type CaptureSnapshotOptions } from "../portfolio/PortfolioSql.js";
import {
  db,
  failure,
  firstOrNotFound,
  nowIso,
  requireNonEmpty,
  type AccountSummaryRow,
  type ConnectionRow,
  type FinanceEffect,
} from "../internal/sql.js";

export const getConnection = (id: string): FinanceEffect<Connection> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const connection = yield* firstOrNotFound(
      yield* db(sql<ConnectionRow>`SELECT id, name, connector_id, created_at, updated_at
        FROM connections WHERE id = ${id}`),
      "Connection",
    );
    const accounts = yield* db(sql<AccountSummaryRow>`SELECT a.id, a.name,
      COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
      a.connector_account_id, count(p.id) AS position_count
      FROM accounts a JOIN assets ba ON ba.id = a.base_currency_asset_id
      LEFT JOIN asset_identifiers ai ON ai.asset_id = ba.id AND ai.identifier_type = 'iso_currency'
      LEFT JOIN positions p ON p.account_id = a.id WHERE a.connection_id = ${id}
      GROUP BY a.id ORDER BY a.created_at, a.id`);
    return {
      id: connection.id,
      name: connection.name,
      connectorId: connection.connector_id,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        baseCurrencyIso: account.base_currency_iso,
        connectorAccountId: account.connector_account_id,
        positionCount: account.position_count,
      })),
      createdAt: connection.created_at,
      updatedAt: connection.updated_at,
    };
  });

export const listConnections = (): FinanceEffect<ReadonlyArray<Connection>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly id: string }>`SELECT id FROM connections ORDER BY created_at, id`,
    );
    return yield* Effect.forEach(rows, ({ id }) => getConnection(id));
  });

export const connectorSyncFailure = (error: ConnectorSyncError): FinanceApiError => {
  if (error instanceof FinanceError) return error;
  const category =
    error instanceof ConnectorAuthenticationError || error instanceof ConnectorFetchAccountsError
      ? error.category
      : "unknown";
  if (error instanceof ConnectorAuthenticationError) {
    return failure("validation", `Connector authentication failed (${category})`);
  }
  if (error instanceof ConnectorFetchAccountsError) {
    return failure("validation", `Connector account fetch failed (${category})`);
  }
  return failure("validation", "The connector could not be synchronized");
};

const insertConnection = (
  name: string,
  connectorId: string,
  credentials: ConnectorCredentialsType,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* sql`INSERT INTO connections
      (id, name, connector_id, config_json, created_at, updated_at)
      VALUES (${id}, ${name}, ${connectorId}, ${JSON.stringify(credentials)}, ${timestamp}, ${timestamp})`;
    return id;
  });

const decodeStoredCredentials = (
  configJson: string,
): Effect.Effect<ConnectorCredentialsType, FinanceApiError> =>
  Effect.try({
    try: () => JSON.parse(configJson),
    catch: () => failure("database", "Stored connector credentials are invalid"),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ConnectorCredentials)),
    Effect.mapError(() => failure("database", "Stored connector credentials are invalid")),
  );

/**
 * Connects an external service and imports its first complete account snapshot.
 * Credentials are persisted in config_json inside the encrypted Vault.
 */
export const connectConnection = (
  input: ConnectConnectionInput,
): Effect.Effect<Connection, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const connector = CONNECTOR_CAPABILITIES.find(({ id }) => id === input.connectorId);
    if (connector === undefined) {
      return yield* Effect.fail(
        failure("connector_unavailable", "No registered connector matches this selection"),
      );
    }
    const name = yield* requireNonEmpty(input.name, "Connection name");
    const id = yield* db(insertConnection(name, input.connectorId, input.credentials));
    yield* syncRegisteredConnector(id, input.connectorId, input.credentials).pipe(
      Effect.mapError(connectorSyncFailure),
      Effect.catch((error) => deleteConnection(id).pipe(Effect.andThen(Effect.fail(error)))),
    );
    return yield* getConnection(id);
  });

/** Re-authenticates with the stored connector credentials and reconciles a complete snapshot. */
export const refreshConnection = (
  id: string,
): Effect.Effect<
  ConnectionRefreshResult,
  FinanceApiError,
  SqlClient.SqlClient | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(
        sql<{
          readonly connector_id: string;
          readonly config_json: string;
        }>`SELECT connector_id, config_json FROM connections WHERE id = ${id}`,
      ),
      "Connection",
    );
    const credentials = yield* decodeStoredCredentials(row.config_json);
    if (Object.keys(credentials).length === 0) {
      return yield* Effect.fail(failure("validation", "Stored connector credentials are missing"));
    }
    yield* syncRegisteredConnector(id, row.connector_id, credentials).pipe(
      Effect.mapError(connectorSyncFailure),
    );
    yield* db(sql`UPDATE connections SET updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* completeConnectionRefresh(id);
  });

/** Records today's Portfolio snapshot after a Connection import or Refresh. */
export const completeConnectionRefresh = (
  id: string,
  options: CaptureSnapshotOptions = {},
): FinanceEffect<ConnectionRefreshResult> =>
  Effect.gen(function* () {
    const refreshOptions = { requireFresh: true };
    if (options.registry !== undefined)
      Object.assign(refreshOptions, { registry: options.registry });
    const failures =
      options.refresh === false ? [] : (yield* refreshPrices(refreshOptions)).failures;
    yield* captureSnapshot({ ...options, refresh: false });
    return { connection: yield* getConnection(id), failures };
  });

export const updateConnection = (
  id: string,
  input: UpdateConnectionInput,
): Effect.Effect<Connection, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const connection = yield* getConnection(id);
    const name = yield* requireNonEmpty(input.name, "Connection name");
    const sql = yield* SqlClient.SqlClient;

    if (input.credentials !== undefined && Object.keys(input.credentials).length > 0) {
      const row = yield* firstOrNotFound(
        yield* db(
          sql<{ readonly config_json: string }>`SELECT config_json FROM connections
            WHERE id = ${id}`,
        ),
        "Connection",
      );
      const stored = yield* decodeStoredCredentials(row.config_json);
      const credentials = { ...stored, ...input.credentials };
      yield* syncRegisteredConnector(id, connection.connectorId, credentials).pipe(
        Effect.mapError(connectorSyncFailure),
      );
      yield* db(
        sql`UPDATE connections SET name = ${name}, config_json = ${JSON.stringify(credentials)},
          updated_at = ${nowIso()} WHERE id = ${id}`,
      );
      return yield* getConnection(id);
    }

    yield* db(
      sql`UPDATE connections SET name = ${name}, updated_at = ${nowIso()} WHERE id = ${id}`,
    );
    return yield* getConnection(id);
  });

export const deleteConnection = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* getConnection(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM connections WHERE id = ${id}`);
  });
