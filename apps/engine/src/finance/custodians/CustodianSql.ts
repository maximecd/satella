import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";
import { ConnectorAuthenticationError, ConnectorFetchAccountsError } from "@optimus/connectors";

import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import type {
  ConnectCustodianInput,
  CreateCustodianInput,
  Custodian,
  FinanceApiError,
  UpdateCustodianInput,
} from "../contracts.js";
import { FinanceApiError as FinanceError } from "../contracts.js";
import { CONNECTOR_CAPABILITIES } from "../config.js";
import { syncRegisteredConnector, type ConnectorSyncError } from "../connector-service.js";
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

export const getCustodian = (id: string): FinanceEffect<Custodian> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const custodian = yield* firstOrNotFound(
      yield* db(sql<CustodianRow>`SELECT c.id, c.name, c.management_mode, c.presentation_role,
        cc.connector_id, c.created_at, c.updated_at FROM custodians c
        LEFT JOIN custodian_connectors cc ON cc.custodian_id = c.id WHERE c.id = ${id}`),
      "Custodian",
    );
    const accounts = yield* db(sql<AccountSummaryRow>`SELECT a.id, a.name, a.account_kind,
      COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
      a.connector_account_id, count(p.id) AS position_count
      FROM accounts a JOIN assets ba ON ba.id = a.base_currency_asset_id
      LEFT JOIN asset_identifiers ai ON ai.asset_id = ba.id AND ai.identifier_type = 'iso_currency'
      LEFT JOIN positions p ON p.account_id = a.id WHERE a.custodian_id = ${id}
      GROUP BY a.id ORDER BY a.created_at, a.id`);
    return {
      id: custodian.id,
      name: custodian.name,
      managementMode: custodian.management_mode,
      presentationRole: custodian.presentation_role,
      connectorId: custodian.connector_id,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        accountKind: account.account_kind,
        baseCurrencyIso: account.base_currency_iso,
        connectorAccountId: account.connector_account_id,
        positionCount: account.position_count,
      })),
      createdAt: custodian.created_at,
      updatedAt: custodian.updated_at,
    };
  });

export const listCustodians = (): FinanceEffect<ReadonlyArray<Custodian>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly id: string }>`SELECT id FROM custodians
        WHERE presentation_role IS NULL ORDER BY created_at, id`,
    );
    return yield* Effect.forEach(rows, ({ id }) => getCustodian(id));
  });

export const createCustodian = (input: CreateCustodianInput): FinanceEffect<Custodian> =>
  Effect.gen(function* () {
    const name = yield* requireNonEmpty(input.name, "Custodian name");
    if (input.managementMode === "synced") {
      const connector = CONNECTOR_CAPABILITIES.find(({ id }) => id === input.connectorId);
      if (connector === undefined) {
        return yield* Effect.fail(
          failure(
            "connector_unavailable",
            "No registered custodian connector can create a synced custodian",
          ),
        );
      }
    }
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
            VALUES (${id}, ${name}, ${input.managementMode}, ${timestamp}, ${timestamp})`;
          if (input.managementMode === "synced") {
            yield* sql`INSERT INTO custodian_connectors
              (custodian_id, connector_id, config_json, created_at, updated_at)
              VALUES (${id}, ${input.connectorId!}, ${JSON.stringify(input.connectorConfig ?? {})}, ${timestamp}, ${timestamp})`;
          }
        }),
      ),
    );
    return yield* getCustodian(id);
  });

export const connectorSyncFailure = (error: ConnectorSyncError): FinanceApiError => {
  if (error instanceof FinanceError) return error;
  const category =
    typeof error === "object" && error !== null && "category" in error
      ? String(error.category)
      : "unknown";
  if (error instanceof ConnectorAuthenticationError) {
    return failure("validation", `Connector authentication failed (${category})`);
  }
  if (error instanceof ConnectorFetchAccountsError) {
    return failure("validation", `Connector account fetch failed (${category})`);
  }
  return failure("validation", "The connector could not be synchronized");
};

/**
 * Connects a custodian and imports its first complete account snapshot.
 * Credentials are persisted in config_json so the custodian can be resynced.
 * This is intentionally the temporary, unencrypted storage boundary.
 */
export const connectCustodian = (
  input: ConnectCustodianInput,
): Effect.Effect<Custodian, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const connector = CONNECTOR_CAPABILITIES.find(({ id }) => id === input.connectorId);
    if (connector === undefined) {
      return yield* Effect.fail(
        failure(
          "connector_unavailable",
          "No registered custodian connector matches this selection",
        ),
      );
    }

    const custodian = yield* createCustodian({
      name: input.name,
      managementMode: "synced",
      connectorId: input.connectorId,
      connectorConfig: input.credentials,
    });
    const synchronized = syncRegisteredConnector(
      custodian.id,
      input.connectorId,
      input.credentials,
    ).pipe(Effect.mapError(connectorSyncFailure));

    yield* synchronized.pipe(
      Effect.catch((error) =>
        deleteCustodian(custodian.id).pipe(Effect.andThen(Effect.fail(error))),
      ),
    );
    return yield* getCustodian(custodian.id);
  });

/** Re-authenticates with the stored connector credentials and reconciles a complete snapshot. */
export const resyncCustodian = (
  id: string,
): Effect.Effect<Custodian, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{
        readonly management_mode: string;
        readonly connector_id: string | null;
        readonly config_json: string | null;
      }>`SELECT c.management_mode, cc.connector_id, cc.config_json
        FROM custodians c
        LEFT JOIN custodian_connectors cc ON cc.custodian_id = c.id
        WHERE c.id = ${id}`,
    );
    const row = yield* firstOrNotFound(rows, "Custodian");
    if (row.management_mode !== "synced" || row.connector_id === null) {
      return yield* Effect.fail(failure("read_only", "Only connector-managed custodians can sync"));
    }
    const credentials = yield* Effect.try({
      try: () => JSON.parse(row.config_json ?? "{}") as unknown,
      catch: () => failure("database", "Stored connector credentials are invalid"),
    });
    if (
      credentials === null ||
      typeof credentials !== "object" ||
      Array.isArray(credentials) ||
      Object.keys(credentials).length === 0
    ) {
      return yield* Effect.fail(failure("validation", "Stored connector credentials are missing"));
    }
    yield* syncRegisteredConnector(id, row.connector_id, credentials).pipe(
      Effect.mapError(connectorSyncFailure),
    );
    yield* db(
      sql`UPDATE custodian_connectors SET updated_at = ${nowIso()} WHERE custodian_id = ${id}`,
    );
    return yield* getCustodian(id);
  });

export const updateCustodian = (
  id: string,
  input: UpdateCustodianInput,
): Effect.Effect<Custodian, FinanceApiError, SqlClient.SqlClient | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const custodian = yield* getCustodian(id);
    if (custodian.presentationRole !== null) {
      return yield* Effect.fail(
        failure("read_only", "System-managed custodians cannot be renamed"),
      );
    }
    const name = yield* requireNonEmpty(input.name, "Custodian name");
    const sql = yield* SqlClient.SqlClient;

    if (input.credentials !== undefined && Object.keys(input.credentials).length > 0) {
      if (custodian.managementMode !== "synced" || custodian.connectorId === null) {
        return yield* Effect.fail(
          failure("read_only", "Manual custodians do not have connector credentials"),
        );
      }
      const row = yield* firstOrNotFound(
        yield* db(
          sql<{ readonly config_json: string }>`SELECT config_json FROM custodian_connectors
            WHERE custodian_id = ${id}`,
        ),
        "Custodian connector",
      );
      const stored = yield* Effect.try({
        try: () => JSON.parse(row.config_json) as unknown,
        catch: () => failure("database", "Stored connector credentials are invalid"),
      });
      if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
        return yield* Effect.fail(failure("database", "Stored connector credentials are invalid"));
      }
      const credentials = { ...(stored as Record<string, unknown>), ...input.credentials };
      yield* syncRegisteredConnector(id, custodian.connectorId, credentials).pipe(
        Effect.mapError(connectorSyncFailure),
      );
      yield* db(
        sql`UPDATE custodian_connectors SET config_json = ${JSON.stringify(credentials)},
          updated_at = ${nowIso()} WHERE custodian_id = ${id}`,
      );
    }

    yield* db(sql`UPDATE custodians SET name = ${name}, updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* getCustodian(id);
  });

export const deleteCustodian = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    const custodian = yield* getCustodian(id);
    if (custodian.presentationRole !== null) {
      return yield* Effect.fail(
        failure("read_only", "System-managed custodians cannot be deleted"),
      );
    }
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM custodians WHERE id = ${id}`);
  });
