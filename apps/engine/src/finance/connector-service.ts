import {
  validateConnectorSnapshot,
  type AuthenticatedConnector,
  type Connector,
  type ConnectorAccount,
  type ConnectorAsset,
  type ConnectorAssetIdentifier,
  type ConnectorAuthenticationError,
  type ConnectorFetchAccountsError,
  type ConnectorFetchResult,
  type ConnectorRegistry,
  type ConnectorSession,
} from "@satella-app/connector-core";
import { HttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

import type {
  NormalizedConnectorAsset,
  NormalizedConnectorPosition,
  NormalizedConnectorOutput,
  ReconciliationResult,
} from "./connector.js";
import { reconcileConnector } from "./connector.js";
import { FinanceApiError } from "./contracts.js";
import type { ConnectorCredentials } from "./contracts.js";
import { canonicalDecimal } from "./financial-number.js";
import { CONNECTOR_REGISTRY } from "./connectors/registry.js";
import { getSettings } from "./settings/SettingsSql.js";

const validationFailure = (message: string) =>
  Effect.fail(new FinanceApiError({ code: "validation", message }));

const normalizeDecimal = (value: string, label: string) =>
  Effect.try({
    try: () => canonicalDecimal(value),
    catch: () => new FinanceApiError({ code: "validation", message: `${label} must be finite` }),
  });

const assetFingerprint = (asset: ConnectorAsset): string =>
  JSON.stringify({
    externalId: asset.externalId,
    assetCategory: asset.assetCategory,
    name: asset.name.trim(),
    symbol: asset.symbol?.trim() ?? null,
    identifiers: [...asset.identifiers]
      .map(({ type, value }) => ({ type: type.trim(), value: value.trim() }))
      .sort((left, right) =>
        `${left.type}:${left.value}`.localeCompare(`${right.type}:${right.value}`),
      ),
  });

const normalizeAsset = (asset: ConnectorAsset): NormalizedConnectorAsset => {
  const normalized = {
    externalAssetId: asset.externalId.trim(),
    assetCategory: asset.assetCategory,
    name: asset.name.trim(),
    identifiers: asset.identifiers.map(({ type, value }: ConnectorAssetIdentifier) => ({
      type: type.trim(),
      value: value.trim(),
    })),
  };
  if (asset.symbol !== undefined) Object.assign(normalized, { symbol: asset.symbol.trim() });
  return normalized;
};

/**
 * Converts the connector-owned nested account tree into the engine's
 * reconciliation input without giving connectors database access.
 */
export const normalizeConnectorAccounts = (
  accounts: ReadonlyArray<ConnectorAccount>,
): Effect.Effect<NormalizedConnectorOutput, FinanceApiError> =>
  Effect.gen(function* () {
    const assets = new Map<
      string,
      { readonly fingerprint: string; readonly asset: NormalizedConnectorAsset }
    >();
    const normalizedAccounts: NormalizedConnectorOutput["accounts"][number][] = [];
    const seenAccountIds = new Set<string>();

    for (const account of accounts) {
      const externalAccountId = account.externalId.trim();
      if (!externalAccountId)
        return yield* validationFailure("Connector returned an empty account ID");
      if (seenAccountIds.has(externalAccountId)) {
        return yield* validationFailure("Connector returned a duplicate account ID");
      }
      seenAccountIds.add(externalAccountId);
      const seenPositionAssets = new Set<string>();
      const positions: NormalizedConnectorPosition[] = [];

      for (const position of account.positions) {
        const quantity = yield* normalizeDecimal(position.quantity, "Connector position quantity");
        const externalAssetId = position.asset.externalId.trim();
        if (!externalAssetId)
          return yield* validationFailure("Connector returned an empty asset ID");
        if (seenPositionAssets.has(externalAssetId)) {
          return yield* validationFailure("Connector returned duplicate positions for one account");
        }
        seenPositionAssets.add(externalAssetId);
        const normalizedAsset = normalizeAsset(position.asset);
        const fingerprint = assetFingerprint(position.asset);
        const previous = assets.get(externalAssetId);
        if (previous !== undefined && previous.fingerprint !== fingerprint) {
          return yield* validationFailure(
            "Connector returned conflicting definitions for one asset",
          );
        }
        if (previous === undefined)
          assets.set(externalAssetId, { fingerprint, asset: normalizedAsset });
        const averageUnitPurchasePrice =
          position.averageUnitPurchasePrice === undefined
            ? undefined
            : {
                price: yield* normalizeDecimal(
                  position.averageUnitPurchasePrice.price,
                  "Connector average purchase price",
                ),
                currencyIso: position.averageUnitPurchasePrice.currencyIso,
              };
        const reportedPrice =
          position.reportedPrice === undefined
            ? undefined
            : yield* Effect.try({
                try: () => {
                  const observedAt = new Date(position.reportedPrice!.observedAt);
                  if (Number.isNaN(observedAt.getTime()))
                    throw new Error("invalid observation time");
                  return {
                    price: canonicalDecimal(position.reportedPrice!.price),
                    currencyIso: position.reportedPrice!.currencyIso.trim().toUpperCase(),
                    observedAt,
                  };
                },
                catch: () =>
                  new FinanceApiError({
                    code: "validation",
                    message: "Connector reported an invalid current price",
                  }),
              });
        const normalizedPosition = {
          externalAssetId,
          quantity,
        };
        if (reportedPrice !== undefined) Object.assign(normalizedPosition, { reportedPrice });
        if (averageUnitPurchasePrice !== undefined) {
          Object.assign(normalizedPosition, { averageUnitPurchasePrice });
        }
        positions.push(normalizedPosition);
      }

      const baseCurrencyIso = account.baseCurrencyIso.trim().toUpperCase();
      if (!baseCurrencyIso)
        return yield* validationFailure("Connector returned an empty base currency");
      const normalizedAccount = {
        externalAccountId,
        name: account.name.trim(),
        baseCurrencyIso,
        positions,
      };
      if (account.accountType !== undefined)
        Object.assign(normalizedAccount, { accountType: account.accountType });
      normalizedAccounts.push(normalizedAccount);
    }

    return {
      complete: true,
      assets: [...assets.values()].map(({ asset }) => asset),
      accounts: normalizedAccounts,
    } satisfies NormalizedConnectorOutput;
  });

export const normalizeConnectorSnapshot = (
  result: ConnectorFetchResult,
): Effect.Effect<NormalizedConnectorOutput, FinanceApiError> =>
  validateConnectorSnapshot(result).pipe(
    Effect.mapError((error) => new FinanceApiError({ code: "validation", message: error.message })),
    Effect.flatMap((snapshot) =>
      normalizeConnectorAccounts(snapshot.accounts).pipe(
        Effect.map((output) => ({ ...output, complete: snapshot.complete })),
      ),
    ),
  );

export const reconcileConnectorAccounts = (
  custodianId: string,
  accounts: ReadonlyArray<ConnectorAccount>,
): Effect.Effect<ReconciliationResult, FinanceApiError, SqlClient.SqlClient> =>
  normalizeConnectorAccounts(accounts).pipe(
    Effect.flatMap((output) => reconcileConnector(custodianId, output)),
  );

export type ConnectorSyncError =
  | FinanceApiError
  | ConnectorAuthenticationError
  | ConnectorFetchAccountsError;

export interface ConnectorSyncResult extends ReconciliationResult {
  readonly session?: ConnectorSession;
}

export interface ConnectorSyncOptions {
  /** Called immediately after authentication, before any portfolio response is parsed. */
  readonly onSession?: (
    session: ConnectorSession,
  ) => Effect.Effect<void, FinanceApiError, SqlClient.SqlClient>;
}

/**
 * Fetches and reconciles an already-authenticated connector. Session state is
 * persisted before and after the fetch so a rotated token is retained even
 * when the subsequent response is malformed.
 */
export const syncAuthenticatedConnector = <R>(
  custodianId: string,
  authenticated: AuthenticatedConnector<R>,
  options: ConnectorSyncOptions = {},
): Effect.Effect<ConnectorSyncResult, ConnectorSyncError, R | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const persistSession = () =>
      authenticated.session !== undefined && options.onSession !== undefined
        ? options.onSession(authenticated.session)
        : Effect.void;
    yield* persistSession();
    const result = yield* authenticated.fetchAccounts().pipe(
      Effect.tap(() => persistSession()),
      Effect.tapError(() => persistSession()),
    );
    const output = yield* normalizeConnectorSnapshot(result);
    const reconciliation = yield* reconcileConnector(custodianId, output);
    yield* persistSession();
    return authenticated.session === undefined
      ? reconciliation
      : { ...reconciliation, session: authenticated.session };
  });

/** Authenticates a connector, fetches its account tree, and reconciles it atomically. */
export const syncConnector = <Credentials, R>(
  custodianId: string,
  connector: Connector<Credentials, R>,
  credentials: Credentials,
  options: ConnectorSyncOptions = {},
): Effect.Effect<ConnectorSyncResult, ConnectorSyncError, R | SqlClient.SqlClient> =>
  connector
    .authenticate(credentials)
    .pipe(
      Effect.flatMap((authenticated: AuthenticatedConnector<R>) =>
        syncAuthenticatedConnector(custodianId, authenticated, options),
      ),
    );

/** Runs a connector selected from the compiled registry without exposing the registry to callers. */
export const syncRegisteredConnectorFrom = (
  registry: ConnectorRegistry,
  custodianId: string,
  connectorId: string,
  credentials: ConnectorCredentials,
  options: ConnectorSyncOptions = {},
): Effect.Effect<
  ConnectorSyncResult,
  ConnectorSyncError,
  SqlClient.SqlClient | HttpClient.HttpClient
> => {
  const connector = registry.get(connectorId);
  if (connector === undefined) {
    return Effect.fail(
      new FinanceApiError({
        code: "connector_unavailable",
        message: "No registered connector matches the requested connector ID",
      }),
    );
  }
  return Effect.gen(function* () {
    if (connectorId !== "evm") {
      return yield* syncConnector(custodianId, connector, credentials, options);
    }
    const settings = yield* getSettings();
    const runtimeCredentials = { ...credentials };
    if (settings.evmRpc.mode === "custom") {
      for (const [chain, url] of Object.entries(settings.evmRpc.urls)) {
        runtimeCredentials[`rpc:${chain}`] = url;
      }
    }
    return yield* syncConnector(custodianId, connector, runtimeCredentials, options);
  });
};

export const syncRegisteredConnector = (
  custodianId: string,
  connectorId: string,
  credentials: ConnectorCredentials,
  options: ConnectorSyncOptions = {},
) =>
  syncRegisteredConnectorFrom(CONNECTOR_REGISTRY, custodianId, connectorId, credentials, options);
