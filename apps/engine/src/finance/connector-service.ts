import type {
  Connector,
  ConnectorAccount,
  ConnectorAsset,
  ConnectorAssetIdentifier,
  AuthenticatedConnector,
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  ConnectorRegistry,
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
        const normalizedPosition = {
          externalAssetId,
          quantity,
        };
        if (averageUnitPurchasePrice !== undefined) {
          Object.assign(normalizedPosition, { averageUnitPurchasePrice });
        }
        positions.push(normalizedPosition);
      }

      const baseCurrencyIso = account.baseCurrencyIso.trim().toUpperCase();
      if (!baseCurrencyIso)
        return yield* validationFailure("Connector returned an empty base currency");
      normalizedAccounts.push({
        externalAccountId,
        name: account.name.trim(),
        baseCurrencyIso,
        positions,
      });
    }

    return {
      complete: true,
      assets: [...assets.values()].map(({ asset }) => asset),
      accounts: normalizedAccounts,
    } satisfies NormalizedConnectorOutput;
  });

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

/** Authenticates a connector, fetches its complete account tree, and reconciles it atomically. */
export const syncConnector = <Credentials, R>(
  custodianId: string,
  connector: Connector<Credentials, R>,
  credentials: Credentials,
): Effect.Effect<ReconciliationResult, ConnectorSyncError, R | SqlClient.SqlClient> =>
  connector.authenticate(credentials).pipe(
    Effect.flatMap((authenticated: AuthenticatedConnector<R>) => authenticated.fetchAccounts()),
    Effect.flatMap((accounts: ReadonlyArray<ConnectorAccount>) =>
      reconcileConnectorAccounts(custodianId, accounts),
    ),
  );

/** Runs a connector selected from the compiled registry without exposing the registry to callers. */
export const syncRegisteredConnectorFrom = (
  registry: ConnectorRegistry,
  custodianId: string,
  connectorId: string,
  credentials: ConnectorCredentials,
): Effect.Effect<
  ReconciliationResult,
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
  return syncConnector(custodianId, connector, credentials);
};

export const syncRegisteredConnector = (
  custodianId: string,
  connectorId: string,
  credentials: ConnectorCredentials,
) => syncRegisteredConnectorFrom(CONNECTOR_REGISTRY, custodianId, connectorId, credentials);
