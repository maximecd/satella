import * as SqlClient from "@effect/sql/SqlClient";
import * as HttpClient from "@effect/platform/HttpClient";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import { randomUUID } from "node:crypto";

import type {
  Account,
  Asset,
  AssetClass,
  CreateAccountInput,
  CreateAssetInput,
  CreateCustodianInput,
  ConnectCustodianInput,
  CreatePositionInput,
  Custodian,
  FinanceApiError,
  IdentifierInput,
  Position,
  PortfolioHistoryPoint,
  SetManualPriceInput,
  SnapshotResult,
  UpdateAccountInput,
  UpdateCustomAssetInput,
} from "./contracts.js";
import { FinanceApiError as FinanceError } from "./contracts.js";
import {
  CONNECTOR_CAPABILITIES,
  DEFAULT_MARKET_DATA_POLICY,
  DEFAULT_REPORTING_CURRENCY,
} from "./config.js";
import { DEFAULT_SNAPSHOT_INTERVAL } from "./config.js";
import { refreshPrices, type MarketDataRegistry } from "./market-data.js";
import { syncRegisteredConnector, type ConnectorSyncError } from "./connector-service.js";
import { ConnectorAuthenticationError, ConnectorFetchAccountsError } from "@optimus/connectors";

type FinanceEffect<A> = Effect.Effect<A, FinanceApiError, SqlClient.SqlClient>;

interface AssetRow {
  readonly id: string;
  readonly asset_class: AssetClass;
  readonly name: string;
  readonly symbol: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface IdentifierRow {
  readonly identifier_type: string;
  readonly identifier_value: string;
}

interface PriceRow {
  readonly price: number;
  readonly currency_asset_id: string;
  readonly currency_iso: string;
  readonly source: string;
  readonly observed_at: string;
  readonly updated_at: string;
}

interface CustodianRow {
  readonly id: string;
  readonly name: string;
  readonly management_mode: "manual" | "synced";
  readonly connector_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface AccountSummaryRow {
  readonly id: string;
  readonly name: string;
  readonly base_currency_iso: string;
  readonly connector_account_id: string | null;
  readonly position_count: number;
}

interface AccountRow {
  readonly id: string;
  readonly custodian_id: string;
  readonly custodian_name: string;
  readonly management_mode: "manual" | "synced";
  readonly name: string;
  readonly base_currency_asset_id: string;
  readonly base_currency_iso: string;
  readonly connector_account_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface PositionRow {
  readonly id: string;
  readonly account_id: string;
  readonly asset_id: string;
  readonly asset_name: string;
  readonly asset_symbol: string | null;
  readonly asset_class: AssetClass;
  readonly quantity: number;
  readonly price: number | null;
  readonly currency_asset_id: string | null;
  readonly currency_iso: string | null;
  readonly source: string | null;
  readonly observed_at: string | null;
  readonly price_updated_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const nowIso = () => new Date().toISOString();

const isStalePrice = (observedAt: string) =>
  Date.parse(observedAt) <
  Date.now() - Duration.toMillis(DEFAULT_MARKET_DATA_POLICY.priceFreshness);

const failure = (code: FinanceApiError["code"], message: string) =>
  new FinanceError({ code, message });

const databaseFailure = (cause: unknown) => {
  const text = cause instanceof Error ? cause.message : String(cause);
  return failure(
    text.includes("UNIQUE") || text.includes("FOREIGN KEY") ? "conflict" : "database",
    text.includes("UNIQUE") || text.includes("FOREIGN KEY")
      ? "The requested change conflicts with existing finance data"
      : "The finance database operation failed",
  );
};

const db = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(databaseFailure),
    Effect.catchAllDefect((cause) => Effect.fail(databaseFailure(cause))),
  );

const requireFinite = (value: number, field: string) =>
  Number.isFinite(value)
    ? Effect.succeed(value)
    : Effect.fail(failure("validation", `${field} must be finite`));

const requireNonEmpty = (value: string, field: string) => {
  const result = value.trim();
  return result.length > 0
    ? Effect.succeed(result)
    : Effect.fail(failure("validation", `${field} is required`));
};

const firstOrNotFound = <A>(rows: ReadonlyArray<A>, entity: string) =>
  rows[0] === undefined
    ? Effect.fail(failure("not_found", `${entity} was not found`))
    : Effect.succeed(rows[0]);

const assertFiat = (assetId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly asset_class: string }>`SELECT asset_class FROM assets WHERE id = ${assetId}`,
    );
    const row = yield* firstOrNotFound(rows, "Currency asset");
    if (row.asset_class !== "fiat") {
      return yield* Effect.fail(
        failure("validation", "Account and price currencies must be fiat assets"),
      );
    }
  });

const usdAssetId = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* db(sql<{ readonly asset_id: string }>`SELECT asset_id FROM asset_identifiers
    WHERE identifier_type = 'iso_currency' AND identifier_value = ${DEFAULT_REPORTING_CURRENCY}`);
  return (yield* firstOrNotFound(rows, "Reporting currency")).asset_id;
});

const loadPrice = (assetId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<PriceRow>`SELECT ap.price, ap.currency_asset_id,
        COALESCE(identifier.identifier_value, currency.symbol, currency.name) AS currency_iso,
        ap.source, ap.observed_at, ap.updated_at
      FROM asset_prices ap
      JOIN assets currency ON currency.id = ap.currency_asset_id
      LEFT JOIN asset_identifiers identifier ON identifier.asset_id = currency.id
        AND identifier.identifier_type = 'iso_currency'
      WHERE ap.asset_id = ${assetId}`);
    const row = rows[0];
    return row === undefined
      ? null
      : {
          price: row.price,
          currencyAssetId: row.currency_asset_id,
          currencyIso: row.currency_iso,
          source: row.source,
          observedAt: row.observed_at,
          updatedAt: row.updated_at,
          isStale: isStalePrice(row.observed_at),
        };
  });

export const getAsset = (id: string): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const asset = yield* firstOrNotFound(
      yield* db(sql<AssetRow>`SELECT id, asset_class, name, symbol, created_at, updated_at
        FROM assets WHERE id = ${id}`),
      "Asset",
    );
    const identifiers = yield* db(sql<IdentifierRow>`SELECT identifier_type, identifier_value
      FROM asset_identifiers WHERE asset_id = ${id} ORDER BY identifier_type, identifier_value`);
    const price = yield* loadPrice(id);
    return {
      id: asset.id,
      assetClass: asset.asset_class,
      name: asset.name,
      symbol: asset.symbol,
      identifiers: identifiers.map(({ identifier_type: type, identifier_value: value }) => ({
        type,
        value,
      })),
      price,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
    };
  });

export const listAssets = (): FinanceEffect<ReadonlyArray<Asset>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<{ readonly id: string }>`SELECT id FROM assets ORDER BY name, id`);
    return yield* Effect.forEach(rows, ({ id }) => getAsset(id));
  });

const findByStrongIdentifier = (identifiers: ReadonlyArray<IdentifierInput>) =>
  Effect.gen(function* () {
    if (identifiers.length === 0) return undefined;
    const sql = yield* SqlClient.SqlClient;
    for (const identifier of identifiers) {
      const rows = yield* db(sql<{
        readonly asset_id: string;
      }>`SELECT asset_id FROM asset_identifiers
        WHERE identifier_type = ${identifier.type.trim()} AND identifier_value = ${identifier.value.trim()}`);
      if (rows[0] !== undefined) return rows[0].asset_id;
    }
    return undefined;
  });

export const createAsset = (input: CreateAssetInput): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    const name = yield* requireNonEmpty(input.name, "Asset name");
    const existingId = yield* findByStrongIdentifier(input.identifiers);
    if (existingId !== undefined) return yield* getAsset(existingId);

    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
            VALUES (${id}, ${input.assetClass}, ${name}, ${input.symbol?.trim() ?? null}, ${timestamp}, ${timestamp})`;
          for (const identifier of input.identifiers) {
            yield* sql`INSERT INTO asset_identifiers
              (id, asset_id, identifier_type, identifier_value)
              VALUES (${randomUUID()}, ${id}, ${identifier.type.trim()}, ${identifier.value.trim()})`;
          }
        }),
      ),
    );
    return yield* getAsset(id);
  });

export const updateCustomAsset = (
  id: string,
  input: UpdateCustomAssetInput,
): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    const asset = yield* getAsset(id);
    if (asset.assetClass !== "custom") {
      return yield* Effect.fail(failure("read_only", "Automatic assets are read-only"));
    }
    const name = yield* requireNonEmpty(input.name, "Asset name");
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`UPDATE assets SET name = ${name}, symbol = ${input.symbol?.trim() ?? null},
      updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* getAsset(id);
  });

export const setManualPrice = (id: string, input: SetManualPriceInput): FinanceEffect<Asset> =>
  Effect.gen(function* () {
    yield* requireFinite(input.price, "Price");
    const asset = yield* getAsset(id);
    if (asset.assetClass !== "custom") {
      return yield* Effect.fail(
        failure("read_only", "Manual prices are allowed only for custom assets"),
      );
    }
    yield* assertFiat(input.currencyAssetId);
    const sql = yield* SqlClient.SqlClient;
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO asset_prices
      (asset_id, price, currency_asset_id, source, observed_at, updated_at)
      VALUES (${id}, ${input.price}, ${input.currencyAssetId}, 'manual', ${input.observedAt ?? timestamp}, ${timestamp})
      ON CONFLICT(asset_id) DO UPDATE SET price = excluded.price,
        currency_asset_id = excluded.currency_asset_id, source = 'manual',
        observed_at = excluded.observed_at, updated_at = excluded.updated_at`);
    return yield* getAsset(id);
  });

export const deleteAsset = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* getAsset(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM assets WHERE id = ${id}`);
  });

export const getCustodian = (id: string): FinanceEffect<Custodian> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const custodian = yield* firstOrNotFound(
      yield* db(sql<CustodianRow>`SELECT c.id, c.name, c.management_mode, cc.connector_id,
        c.created_at, c.updated_at FROM custodians c
        LEFT JOIN custodian_connectors cc ON cc.custodian_id = c.id WHERE c.id = ${id}`),
      "Custodian",
    );
    const accounts = yield* db(sql<AccountSummaryRow>`SELECT a.id, a.name,
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
      connectorId: custodian.connector_id,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
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
      sql<{ readonly id: string }>`SELECT id FROM custodians ORDER BY created_at, id`,
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

const connectorSyncFailure = (error: ConnectorSyncError): FinanceApiError => {
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
      Effect.catchAll((error) =>
        deleteCustodian(custodian.id).pipe(Effect.zipRight(Effect.fail(error))),
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

export const renameCustodian = (id: string, nameInput: string): FinanceEffect<Custodian> =>
  Effect.gen(function* () {
    yield* getCustodian(id);
    const name = yield* requireNonEmpty(nameInput, "Custodian name");
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`UPDATE custodians SET name = ${name}, updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* getCustodian(id);
  });

export const deleteCustodian = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* getCustodian(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM custodians WHERE id = ${id}`);
  });

const assertManualAccountOwner = (accountId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(sql<{ readonly management_mode: string }>`SELECT c.management_mode
        FROM accounts a JOIN custodians c ON c.id = a.custodian_id WHERE a.id = ${accountId}`),
      "Account",
    );
    if (row.management_mode !== "manual") {
      return yield* Effect.fail(
        failure("read_only", "Connector-managed accounts and positions are read-only"),
      );
    }
  });

const loadPosition = (
  row: PositionRow,
  valuationCurrencyId: string,
  reportingCurrencyId: string,
  fx: ReadonlyMap<string, number>,
): Position => {
  const implicitFiatPrice =
    row.asset_class === "fiat" &&
    (row.asset_id === valuationCurrencyId || row.asset_id === reportingCurrencyId)
      ? 1
      : null;
  const selectedPrice = row.price ?? implicitFiatPrice;
  const currencyId =
    row.currency_asset_id ??
    (implicitFiatPrice === null
      ? null
      : row.asset_id === valuationCurrencyId
        ? valuationCurrencyId
        : reportingCurrencyId);
  const currencyRate =
    currencyId === reportingCurrencyId ? 1 : currencyId === null ? undefined : fx.get(currencyId);
  const valuationRate =
    valuationCurrencyId === reportingCurrencyId ? 1 : fx.get(valuationCurrencyId);
  const conversion =
    currencyId === valuationCurrencyId
      ? 1
      : currencyRate === undefined || valuationRate === undefined
        ? undefined
        : currencyRate / valuationRate;
  const reportingValue =
    selectedPrice === null || conversion === undefined
      ? null
      : row.quantity * selectedPrice * conversion;
  return {
    id: row.id,
    accountId: row.account_id,
    assetId: row.asset_id,
    assetName: row.asset_name,
    assetSymbol: row.asset_symbol,
    assetClass: row.asset_class,
    quantity: row.quantity,
    price:
      row.price === null ||
      row.currency_asset_id === null ||
      row.currency_iso === null ||
      row.source === null ||
      row.observed_at === null ||
      row.price_updated_at === null
        ? null
        : {
            price: row.price,
            currencyAssetId: row.currency_asset_id,
            currencyIso: row.currency_iso,
            source: row.source,
            observedAt: row.observed_at,
            updatedAt: row.price_updated_at,
            isStale: isStalePrice(row.observed_at),
          },
    reportingValue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const getAccount = (id: string): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const account = yield* firstOrNotFound(
      yield* db(sql<AccountRow>`SELECT a.id, a.custodian_id, c.name AS custodian_name,
        c.management_mode, a.name, a.base_currency_asset_id,
        COALESCE(ai.identifier_value, ba.symbol, ba.name) AS base_currency_iso,
        a.connector_account_id, a.created_at, a.updated_at
        FROM accounts a JOIN custodians c ON c.id = a.custodian_id
        JOIN assets ba ON ba.id = a.base_currency_asset_id
        LEFT JOIN asset_identifiers ai ON ai.asset_id = ba.id AND ai.identifier_type = 'iso_currency'
        WHERE a.id = ${id}`),
      "Account",
    );
    const rows = yield* db(sql<PositionRow>`SELECT p.id, p.account_id, p.asset_id,
      a.name AS asset_name, a.symbol AS asset_symbol, a.asset_class, p.quantity,
      ap.price, ap.currency_asset_id,
      COALESCE(price_identifier.identifier_value, price_currency.symbol, price_currency.name)
        AS currency_iso,
      ap.source, ap.observed_at,
      ap.updated_at AS price_updated_at, p.created_at, p.updated_at
      FROM positions p JOIN assets a ON a.id = p.asset_id
      LEFT JOIN asset_prices ap ON ap.asset_id = a.id
      LEFT JOIN assets price_currency ON price_currency.id = ap.currency_asset_id
      LEFT JOIN asset_identifiers price_identifier ON price_identifier.asset_id = price_currency.id
        AND price_identifier.identifier_type = 'iso_currency'
      WHERE p.account_id = ${id} ORDER BY a.name, p.id`);
    const reportingCurrencyId = yield* usdAssetId;
    const fxRows = yield* db(sql<{
      readonly asset_id: string;
      readonly price: number;
    }>`SELECT asset_id, price
      FROM asset_prices WHERE currency_asset_id = ${reportingCurrencyId}`);
    const fx = new Map(fxRows.map(({ asset_id, price }) => [asset_id, price] as const));
    const positions = rows.map((row) =>
      loadPosition(row, account.base_currency_asset_id, reportingCurrencyId, fx),
    );
    return {
      id: account.id,
      custodianId: account.custodian_id,
      custodianName: account.custodian_name,
      managementMode: account.management_mode,
      name: account.name,
      baseCurrencyAssetId: account.base_currency_asset_id,
      baseCurrencyIso: account.base_currency_iso,
      connectorAccountId: account.connector_account_id,
      positions,
      total: positions.reduce((sum, position) => sum + (position.reportingValue ?? 0), 0),
      totalIncomplete: positions.some((position) => position.reportingValue === null),
      hasStalePrices: positions.some((position) => position.price?.isStale === true),
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
  });

export const createAccount = (input: CreateAccountInput): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const custodian = yield* getCustodian(input.custodianId);
    if (custodian.managementMode !== "manual") {
      return yield* Effect.fail(failure("read_only", "Connector-managed custodians are read-only"));
    }
    const name = yield* requireNonEmpty(input.name, "Account name");
    const currencyId = input.baseCurrencyAssetId ?? (yield* usdAssetId);
    yield* assertFiat(currencyId);
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO accounts
      (id, custodian_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
      VALUES (${id}, ${input.custodianId}, ${name}, ${currencyId}, NULL, ${timestamp}, ${timestamp})`);
    return yield* getAccount(id);
  });

export const updateAccount = (id: string, input: UpdateAccountInput): FinanceEffect<Account> =>
  Effect.gen(function* () {
    yield* assertManualAccountOwner(id);
    yield* assertFiat(input.baseCurrencyAssetId);
    const name = yield* requireNonEmpty(input.name, "Account name");
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`UPDATE accounts SET name = ${name}, base_currency_asset_id = ${input.baseCurrencyAssetId},
      updated_at = ${nowIso()} WHERE id = ${id}`);
    return yield* getAccount(id);
  });

export const deleteAccount = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    yield* assertManualAccountOwner(id);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM accounts WHERE id = ${id}`);
  });

export const createPosition = (input: CreatePositionInput): FinanceEffect<Account> =>
  Effect.gen(function* () {
    yield* assertManualAccountOwner(input.accountId);
    yield* getAsset(input.assetId);
    yield* requireFinite(input.quantity, "Quantity");
    const sql = yield* SqlClient.SqlClient;
    const timestamp = nowIso();
    yield* db(sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
      VALUES (${randomUUID()}, ${input.accountId}, ${input.assetId}, ${input.quantity}, ${timestamp}, ${timestamp})`);
    return yield* getAccount(input.accountId);
  });

const positionAccountId = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(
      sql<{ readonly account_id: string }>`SELECT account_id FROM positions WHERE id = ${id}`,
    );
    return (yield* firstOrNotFound(rows, "Position")).account_id;
  });

export const updatePosition = (id: string, quantity: number): FinanceEffect<Account> =>
  Effect.gen(function* () {
    const accountId = yield* positionAccountId(id);
    yield* assertManualAccountOwner(accountId);
    yield* requireFinite(quantity, "Quantity");
    const sql = yield* SqlClient.SqlClient;
    yield* db(
      sql`UPDATE positions SET quantity = ${quantity}, updated_at = ${nowIso()} WHERE id = ${id}`,
    );
    return yield* getAccount(accountId);
  });

export const getPositionAccount = (id: string): FinanceEffect<Account> =>
  positionAccountId(id).pipe(Effect.flatMap(getAccount));

export const deletePosition = (id: string): FinanceEffect<void> =>
  Effect.gen(function* () {
    const accountId = yield* positionAccountId(id);
    yield* assertManualAccountOwner(accountId);
    const sql = yield* SqlClient.SqlClient;
    yield* db(sql`DELETE FROM positions WHERE id = ${id}`);
  });

export interface CaptureSnapshotOptions {
  readonly refresh?: boolean;
  readonly registry?: MarketDataRegistry;
  readonly now?: () => Date;
}

export const captureSnapshot = (
  options: CaptureSnapshotOptions = {},
): FinanceEffect<SnapshotResult> =>
  Effect.gen(function* () {
    if (options.refresh !== false) {
      yield* refreshPrices({
        requireFresh: true,
        ...(options.registry === undefined ? {} : { registry: options.registry }),
      });
    }
    const sql = yield* SqlClient.SqlClient;
    const id = randomUUID();
    const capturedAt = (options.now ?? (() => new Date()))().toISOString();
    const result = yield* db(
      sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO snapshots (id, captured_at) VALUES (${id}, ${capturedAt})`;
          yield* sql`INSERT INTO position_snapshots (snapshot_id, position_id, quantity)
            SELECT ${id}, id, quantity FROM positions`;
          yield* sql`INSERT INTO asset_price_snapshots
            (snapshot_id, asset_id, price, currency_asset_id, source, observed_at)
            SELECT ${id}, ap.asset_id, ap.price, ap.currency_asset_id, ap.source, ap.observed_at
            FROM asset_prices ap WHERE EXISTS (SELECT 1 FROM positions p WHERE p.asset_id = ap.asset_id)`;
          const positions = yield* sql<{
            readonly count: number;
          }>`SELECT count(*) AS count FROM position_snapshots
            WHERE snapshot_id = ${id}`;
          const prices = yield* sql<{
            readonly count: number;
          }>`SELECT count(*) AS count FROM asset_price_snapshots
            WHERE snapshot_id = ${id}`;
          return { positionCount: positions[0]?.count ?? 0, priceCount: prices[0]?.count ?? 0 };
        }),
      ),
    );
    return { id, capturedAt, ...result };
  });

export const captureSnapshotIfDue = (
  options: CaptureSnapshotOptions = {},
): FinanceEffect<SnapshotResult | null> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const latest = yield* db(sql<{ readonly captured_at: string }>`SELECT captured_at FROM snapshots
      ORDER BY captured_at DESC LIMIT 1`);
    const now = (options.now ?? (() => new Date()))();
    const previous = latest[0]?.captured_at;
    if (
      previous !== undefined &&
      now.getTime() - Date.parse(previous) < Duration.toMillis(DEFAULT_SNAPSHOT_INTERVAL)
    ) {
      return null;
    }
    return yield* captureSnapshot({ ...options, now: () => now });
  });

interface HistoricalPositionRow {
  readonly snapshot_id: string;
  readonly captured_at: string;
  readonly asset_id: string | null;
  readonly asset_class: AssetClass | null;
  readonly quantity: number | null;
  readonly price: number | null;
  readonly currency_asset_id: string | null;
}

export const getPortfolioHistory = (): FinanceEffect<ReadonlyArray<PortfolioHistoryPoint>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const reportingCurrencyId = yield* usdAssetId;
    const rows = yield* db(sql<HistoricalPositionRow>`SELECT s.id AS snapshot_id, s.captured_at,
      p.asset_id, a.asset_class, ps.quantity, aps.price, aps.currency_asset_id
      FROM snapshots s
      LEFT JOIN position_snapshots ps ON ps.snapshot_id = s.id
      LEFT JOIN positions p ON p.id = ps.position_id
      LEFT JOIN assets a ON a.id = p.asset_id
      LEFT JOIN asset_price_snapshots aps ON aps.snapshot_id = s.id AND aps.asset_id = p.asset_id
      ORDER BY s.captured_at, s.id`);
    const fxRows = yield* db(
      sql<{
        readonly snapshot_id: string;
        readonly asset_id: string;
        readonly price: number;
      }>`SELECT
        snapshot_id, asset_id, price FROM asset_price_snapshots
        WHERE currency_asset_id = ${reportingCurrencyId}`,
    );
    const fx = new Map(
      fxRows.map(
        ({ snapshot_id, asset_id, price }) => [`${snapshot_id}:${asset_id}`, price] as const,
      ),
    );
    const grouped = Map.groupBy(rows, ({ snapshot_id }) => snapshot_id);
    return [...grouped.values()].map((snapshotRows) => {
      const first = snapshotRows[0]!;
      let total = 0;
      let totalIncomplete = false;
      for (const row of snapshotRows) {
        if (row.asset_id === null || row.quantity === null) continue;
        const implicit = row.asset_class === "fiat" && row.asset_id === reportingCurrencyId;
        const price = row.price ?? (implicit ? 1 : null);
        const currencyId = row.currency_asset_id ?? (implicit ? reportingCurrencyId : null);
        const conversion =
          currencyId === reportingCurrencyId
            ? 1
            : currencyId === null
              ? undefined
              : fx.get(`${row.snapshot_id}:${currencyId}`);
        if (price === null || conversion === undefined) totalIncomplete = true;
        else total += row.quantity * price * conversion;
      }
      return {
        snapshotId: first.snapshot_id,
        capturedAt: first.captured_at,
        total,
        totalIncomplete,
      };
    });
  });

export const connectorCapabilities = () => ({ connectors: CONNECTOR_CAPABILITIES });
