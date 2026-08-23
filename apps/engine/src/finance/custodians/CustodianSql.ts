import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";
import {
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  type ConnectorRegistry,
} from "@satella-app/connector-core";

import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import type {
  ConnectCustodianInput,
  CreateCustodianInput,
  Custodian,
  CustodianRefreshResult,
  ConnectorCredentials as ConnectorCredentialsType,
  FinanceApiError,
  PriceRefreshFailure,
  UpdateCustodianInput,
} from "../contracts.js";
import { ConnectorCredentials, FinanceApiError as FinanceError } from "../contracts.js";
import * as Schema from "effect/Schema";
import { CONNECTOR_CAPABILITIES, DEFAULT_MANUAL_CUSTODIAN_ID } from "../config.js";
import {
  syncRegisteredConnector,
  syncRegisteredConnectorFrom,
  type ConnectorSyncError,
} from "../connector-service.js";
import { refreshPrices, type MarketDataRegistry } from "../market-data.js";
import { captureSnapshot, type CaptureSnapshotOptions } from "../portfolio/PortfolioSql.js";
import {
  db,
  failure,
  firstOrNotFound,
  nowIso,
  requireNonEmpty,
  type AccountSummaryRow,
  type CustodianRow,
  type FinanceEffect,
} from "../internal/sql.js";

const toCustodian = (row: CustodianRow, accounts: ReadonlyArray<AccountSummaryRow>): Custodian => ({
  id: row.id,
  name: row.name,
  connectorId: row.connector_id,
  isDefault: row.id === DEFAULT_MANUAL_CUSTODIAN_ID,
  accounts: accounts.map((account) => ({
    id: account.id,
    name: account.name,
    accountType: account.account_type,
    baseCurrencyIso: account.base_currency_iso,
    connectorAccountId: account.connector_account_id,
    positionCount: account.position_count,
  })),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getCustodian = (id: string): FinanceEffect<Custodian> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const custodian = yield* firstOrNotFound(
      yield* db(sql<CustodianRow>`SELECT id, name, connector_id, created_at, updated_at
        FROM custodians WHERE id = ${id}`),
      "Custodian",
    );
    const accounts = yield* db(sql<AccountSummaryRow>`SELECT a.id, a.name, a.account_type,
      COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
      a.connector_account_id, count(p.id) AS position_count
      FROM accounts a JOIN assets ba ON ba.id = a.base_currency_asset_id
      LEFT JOIN asset_identifiers ai ON ai.asset_id = ba.id AND ai.identifier_type = 'iso_currency'
      LEFT JOIN positions p ON p.account_id = a.id WHERE a.custodian_id = ${id}
      GROUP BY a.id ORDER BY a.created_at, a.id`);
    return toCustodian(custodian, accounts);
  });

export const listCustodians = (): FinanceEffect<ReadonlyArray<Custodian>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly id: string }>`SELECT id FROM custodians ORDER BY created_at, id`,
    );
    return yield* Effect.forEach(rows, ({ id }) => getCustodian(id));
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

const insertSyncedCustodian = (
  name: string,
  connectorId: string,
  credentials: ConnectorCredentialsType,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* sql`INSERT INTO custodians
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

export const createCustodian = (input: CreateCustodianInput): FinanceEffect<Custodian> =>
  Effect.gen(function* () {
    const name = yield* requireNonEmpty(input.name, "Custodian name");
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO custodians
      (id, name, connector_id, config_json, created_at, updated_at)
      VALUES (${id}, ${name}, NULL, NULL, ${timestamp}, ${timestamp})`);
    return yield* getCustodian(id);
  });

/**
 * Connects an external service and imports its first complete account snapshot.
 * Credentials are persisted in config_json inside the encrypted Vault.
 */
export const connectCustodian = (
  input: ConnectCustodianInput,
): Effect.Effect<Custodian, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const connector = CONNECTOR_CAPABILITIES.find(({ id }) => id === input.connectorId);
    if (connector === undefined) {
      return yield* Effect.fail(
        failure("connector_unavailable", "No registered connector matches this selection"),
      );
    }
    const name = yield* requireNonEmpty(input.name, "Custodian name");
    const id = yield* db(insertSyncedCustodian(name, input.connectorId, input.credentials));
    yield* syncRegisteredConnector(id, input.connectorId, input.credentials).pipe(
      Effect.mapError(connectorSyncFailure),
      Effect.catch((error) => deleteCustodian(id).pipe(Effect.andThen(Effect.fail(error)))),
    );
    return yield* getCustodian(id);
  });

/** Re-authenticates with the stored connector credentials and reconciles holdings, without prices or snapshots. */
export const refreshCustodianHoldings = (
  id: string,
  options: { readonly registry?: ConnectorRegistry } = {},
): Effect.Effect<void, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(
        sql<{
          readonly connector_id: string | null;
          readonly config_json: string | null;
        }>`SELECT connector_id, config_json FROM custodians WHERE id = ${id}`,
      ),
      "Custodian",
    );
    const configJson = row.config_json;
    if (row.connector_id === null || configJson === null) {
      return yield* Effect.fail(failure("validation", "Only synced custodians can be refreshed"));
    }
    const credentials = yield* decodeStoredCredentials(configJson);
    if (Object.keys(credentials).length === 0) {
      return yield* Effect.fail(failure("validation", "Stored connector credentials are missing"));
    }
    const sync =
      options.registry === undefined
        ? syncRegisteredConnector(id, row.connector_id, credentials)
        : syncRegisteredConnectorFrom(options.registry, id, row.connector_id, credentials);
    yield* sync.pipe(Effect.mapError(connectorSyncFailure));
    yield* db(sql`UPDATE custodians SET updated_at = ${nowIso()} WHERE id = ${id}`);
  });

/** Re-authenticates with the stored connector credentials and reconciles a complete snapshot. */
export const refreshCustodian = (
  id: string,
  options: {
    readonly connectorRegistry?: ConnectorRegistry;
    readonly registry?: MarketDataRegistry;
  } = {},
): Effect.Effect<
  CustodianRefreshResult,
  FinanceApiError,
  SqlClient.SqlClient | HttpClient.HttpClient
> =>
  refreshCustodianHoldings(
    id,
    options.connectorRegistry === undefined ? {} : { registry: options.connectorRegistry },
  ).pipe(
    Effect.andThen(
      completeCustodianRefresh(
        id,
        options.registry === undefined ? {} : { registry: options.registry },
      ),
    ),
  );

/** Reconciles a synced Custodian without doing market-data or Snapshot work. */
export const reconcileCustodian = (
  id: string,
  options: { readonly registry?: ConnectorRegistry } = {},
): Effect.Effect<Custodian, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  refreshCustodianHoldings(id, options).pipe(Effect.andThen(getCustodian(id)));

export interface RefreshCompletionResult {
  readonly failures: ReadonlyArray<PriceRefreshFailure>;
  readonly error: FinanceApiError | null;
}

/** Performs the one shared price pass and Snapshot at the end of a refresh pipeline. */
export const completeRefreshPass = (
  options: CaptureSnapshotOptions = {},
): Effect.Effect<RefreshCompletionResult, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    let price: RefreshCompletionResult;
    if (options.refresh === false) {
      price = { failures: [], error: null };
    } else {
      const refreshOptions = {
        requireFresh: true,
        includeAllCashFx: true,
      };
      if (options.registry !== undefined)
        Object.assign(refreshOptions, { registry: options.registry });
      price = yield* refreshPrices(refreshOptions).pipe(
        Effect.map(({ failures }) => ({ failures, error: null })),
        Effect.catch((error) => Effect.succeed({ failures: [], error })),
      );
    }
    const snapshotError = yield* captureSnapshot({ ...options, refresh: false }).pipe(
      Effect.map(() => null),
      Effect.catch((error) => Effect.succeed(error)),
    );
    return {
      failures: price.failures,
      error: price.error ?? snapshotError,
    };
  });

/** Records today's Portfolio snapshot after a synced custodian import or Refresh. */
export const completeCustodianRefresh = (
  id: string,
  options: CaptureSnapshotOptions = {},
): FinanceEffect<CustodianRefreshResult> =>
  Effect.gen(function* () {
    const completion = yield* completeRefreshPass(options);
    if (completion.error !== null) return yield* Effect.fail(completion.error);
    return { custodian: yield* getCustodian(id), failures: completion.failures };
  });

export const updateCustodian = (
  id: string,
  input: UpdateCustodianInput,
): Effect.Effect<Custodian, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const custodian = yield* getCustodian(id);
    const name = yield* requireNonEmpty(input.name, "Custodian name");
    const sql = yield* SqlClient.SqlClient;

    if (input.credentials !== undefined && Object.keys(input.credentials).length > 0) {
      if (custodian.connectorId === null) {
        return yield* Effect.fail(
          failure("validation", "Manual custodians do not store connector credentials"),
        );
      }
      const row = yield* firstOrNotFound(
        yield* db(
          sql<{ readonly config_json: string | null }>`SELECT config_json FROM custodians
            WHERE id = ${id}`,
        ),
        "Custodian",
      );
      const configJson = row.config_json;
      if (configJson === null) {
        return yield* Effect.fail(failure("database", "Stored connector credentials are invalid"));
      }
      const stored = yield* decodeStoredCredentials(configJson);
      const credentials = { ...stored, ...input.credentials };
      yield* syncRegisteredConnector(id, custodian.connectorId, credentials).pipe(
        Effect.mapError(connectorSyncFailure),
      );
      yield* db(
        sql`UPDATE custodians SET name = ${name}, config_json = ${JSON.stringify(credentials)},
          updated_at = ${nowIso()} WHERE id = ${id}`,
      );
      return yield* getCustodian(id);
    }

    yield* db(sql`UPDATE custodians SET name = ${name}, updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* getCustodian(id);
  });

export const deleteCustodian = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    const custodian = yield* getCustodian(id);
    if (custodian.isDefault) {
      return yield* Effect.fail(
        failure("validation", "The default manual custodian cannot be deleted"),
      );
    }
    const sql = yield* SqlClient.SqlClient;
    if (custodian.connectorId === null && custodian.accounts.length > 0) {
      return yield* Effect.fail(
        failure("validation", "Delete this custodian's accounts before deleting the custodian"),
      );
    }
    if (custodian.connectorId !== null) {
      yield* db(sql`DELETE FROM accounts WHERE custodian_id = ${id}`);
    }
    yield* db(sql`DELETE FROM custodians WHERE id = ${id}`);
  });
