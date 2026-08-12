import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import { randomUUID } from "node:crypto";

import type { AssetClass, IdentifierInput } from "./contracts.js";
import { FinanceApiError } from "./contracts.js";

export interface NormalizedConnectorAsset {
  readonly externalAssetId: string;
  readonly assetClass: Exclude<AssetClass, "custom">;
  readonly name: string;
  readonly symbol?: string;
  readonly identifiers: ReadonlyArray<IdentifierInput>;
}

export interface NormalizedConnectorPosition {
  readonly externalAssetId: string;
  readonly quantity: number;
  readonly reportedPrice?: {
    readonly price: number;
    readonly currencyIso: string;
    readonly observedAt: Date;
  };
}

export interface NormalizedConnectorAccount {
  readonly externalAccountId: string;
  readonly name: string;
  readonly baseCurrencyIso: string;
  readonly positions: ReadonlyArray<NormalizedConnectorPosition>;
}

export interface NormalizedConnectorOutput {
  readonly complete: boolean;
  readonly assets: ReadonlyArray<NormalizedConnectorAsset>;
  readonly accounts: ReadonlyArray<NormalizedConnectorAccount>;
}

export interface ReconciliationResult {
  readonly accountCount: number;
  readonly positionCount: number;
  readonly zeroedPositionCount: number;
  readonly removedAccountCount: number;
}

const fail = (code: FinanceApiError["code"], message: string) =>
  Effect.fail(new FinanceApiError({ code, message }));

const nonEmpty = (value: string, label: string) => {
  const trimmed = value.trim();
  return trimmed ? Effect.succeed(trimmed) : fail("validation", `${label} is required`);
};

const finite = (value: number, label: string) =>
  Number.isFinite(value) ? Effect.succeed(value) : fail("validation", `${label} must be finite`);

const marketDataIdentifierTypes = [
  "coingecko_coin_id",
  "coingecko_platform",
  "contract_address",
  "yahoo_symbol",
] as const;

const connectorIdentifier = (identifier: IdentifierInput) => ({
  type: identifier.type.trim(),
  value: identifier.value.trim(),
});

const ensureFiat = (isoInput: string) =>
  Effect.gen(function* () {
    const iso = isoInput.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso))
      return yield* fail("validation", "Base and price currencies must be ISO currency codes");
    const sql = yield* SqlClient.SqlClient;
    const existing = yield* sql<{
      readonly asset_id: string;
    }>`SELECT asset_id FROM asset_identifiers
      WHERE identifier_type = 'iso_currency' AND identifier_value = ${iso}`;
    if (existing[0] !== undefined) return existing[0].asset_id;
    const id = `fiat:${iso}`;
    const timestamp = new Date().toISOString();
    yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
      VALUES (${id}, 'fiat', ${iso}, ${iso}, ${timestamp}, ${timestamp})`;
    yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
      VALUES (${randomUUID()}, ${id}, 'iso_currency', ${iso})`;
    return id;
  });

const findAssetBySymbol = (asset: NormalizedConnectorAsset) =>
  Effect.gen(function* () {
    const symbol = asset.symbol?.trim();
    if (symbol === undefined || symbol.length === 0) return undefined;
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      readonly asset_id: string;
      readonly has_market_data_identifier: number;
    }>`SELECT a.id AS asset_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM asset_identifiers ai
          WHERE ai.asset_id = a.id AND ai.identifier_type IN ${sql.in(marketDataIdentifierTypes)}
        ) THEN 1 ELSE 0 END AS has_market_data_identifier
      FROM assets a
      WHERE a.asset_class = ${asset.assetClass}
        AND a.symbol IS NOT NULL
        AND lower(trim(a.symbol)) = lower(trim(${symbol}))
      ORDER BY has_market_data_identifier DESC, a.created_at, a.id`;
    const providerMatches = rows.filter(
      ({ has_market_data_identifier }) => Number(has_market_data_identifier) === 1,
    );
    if (providerMatches.length === 1) return providerMatches[0]!.asset_id;
    if (rows.length === 1) return rows[0]!.asset_id;
    return undefined;
  });

const attachConnectorIdentifiers = (assetId: string, identifiers: ReadonlyArray<IdentifierInput>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    for (const rawIdentifier of identifiers) {
      const identifier = connectorIdentifier(rawIdentifier);
      yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
        VALUES (${randomUUID()}, ${assetId}, ${identifier.type}, ${identifier.value})
        ON CONFLICT(identifier_type, identifier_value) DO NOTHING`;
    }
  });

/**
 * Moves all current and historical references from a duplicate asset to its
 * canonical automatic asset, then removes the duplicate row.
 */
export const mergeAssets = (sourceAssetId: string, targetAssetId: string) =>
  Effect.gen(function* () {
    if (sourceAssetId === targetAssetId) return;
    const sql = yield* SqlClient.SqlClient;
    const sourcePositions = yield* sql<{
      readonly id: string;
      readonly account_id: string;
      readonly quantity: number;
    }>`SELECT id, account_id, quantity FROM positions WHERE asset_id = ${sourceAssetId}`;
    for (const source of sourcePositions) {
      const target = yield* sql<{
        readonly id: string;
      }>`SELECT id FROM positions
        WHERE account_id = ${source.account_id} AND asset_id = ${targetAssetId}`;
      const targetPositionId = target[0]?.id;
      if (targetPositionId === undefined) {
        yield* sql`UPDATE positions SET asset_id = ${targetAssetId}, updated_at = ${new Date().toISOString()}
          WHERE id = ${source.id}`;
        continue;
      }
      yield* sql`INSERT INTO position_snapshots (snapshot_id, position_id, quantity)
        SELECT snapshot_id, ${targetPositionId}, quantity FROM position_snapshots
        WHERE position_id = ${source.id}
        ON CONFLICT(snapshot_id, position_id) DO UPDATE
          SET quantity = position_snapshots.quantity + excluded.quantity`;
      yield* sql`UPDATE positions SET quantity = quantity + ${source.quantity},
        updated_at = ${new Date().toISOString()} WHERE id = ${targetPositionId}`;
      yield* sql`DELETE FROM positions WHERE id = ${source.id}`;
    }
    yield* sql`UPDATE connector_asset_mappings SET asset_id = ${targetAssetId}
      WHERE asset_id = ${sourceAssetId}`;
    yield* sql`UPDATE asset_identifiers SET asset_id = ${targetAssetId}
      WHERE asset_id = ${sourceAssetId}`;
    yield* sql`INSERT INTO asset_prices
      (asset_id, price, currency_asset_id, source, observed_at, updated_at)
      SELECT ${targetAssetId}, price, currency_asset_id, source, observed_at, updated_at
      FROM asset_prices WHERE asset_id = ${sourceAssetId}
      ON CONFLICT(asset_id) DO NOTHING`;
    yield* sql`INSERT INTO asset_price_snapshots
      (snapshot_id, asset_id, price, currency_asset_id, source, observed_at)
      SELECT snapshot_id, ${targetAssetId}, price, currency_asset_id, source, observed_at
      FROM asset_price_snapshots WHERE asset_id = ${sourceAssetId}
      ON CONFLICT(snapshot_id, asset_id) DO NOTHING`;
    yield* sql`DELETE FROM asset_price_snapshots WHERE asset_id = ${sourceAssetId}`;
    yield* sql`DELETE FROM assets WHERE id = ${sourceAssetId}`;
  });

/** Reconciles legacy connector-created duplicates with one unambiguous automatic asset. */
export const mergeConnectorAssetDuplicates = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const candidates = yield* sql<{
      readonly source_asset_id: string;
      readonly target_asset_id: string;
    }>`SELECT mapped.asset_id AS source_asset_id, candidate.id AS target_asset_id
      FROM connector_asset_mappings mapped
      JOIN assets source ON source.id = mapped.asset_id
      JOIN assets candidate ON candidate.id <> source.id
        AND candidate.asset_class = source.asset_class
        AND candidate.symbol IS NOT NULL
        AND source.symbol IS NOT NULL
        AND lower(trim(candidate.symbol)) = lower(trim(source.symbol))
      WHERE EXISTS (
        SELECT 1 FROM asset_identifiers provider_identifier
        WHERE provider_identifier.asset_id = candidate.id
          AND provider_identifier.identifier_type IN ${sql.in(marketDataIdentifierTypes)}
      )`;
    const bySource = Map.groupBy(candidates, ({ source_asset_id }) => source_asset_id);
    let merged = 0;
    for (const [sourceAssetId, matches] of bySource) {
      const targetAssetIds = [...new Set(matches.map(({ target_asset_id }) => target_asset_id))];
      if (targetAssetIds.length !== 1) continue;
      yield* mergeAssets(sourceAssetId, targetAssetIds[0]!);
      merged += 1;
    }
    return merged;
  });

const resolveAsset = (
  custodianId: string,
  asset: NormalizedConnectorAsset,
  repairMappedAsset: boolean,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const mapped = yield* sql<{
      readonly asset_id: string;
    }>`SELECT asset_id FROM connector_asset_mappings
      WHERE custodian_id = ${custodianId} AND external_asset_id = ${asset.externalAssetId}`;
    if (mapped[0] !== undefined) {
      // Older connector syncs could create a symbol-only asset before a
      // matching automatic asset existed. On a complete result, merge it
      // into the canonical asset while preserving positions and history.
      const matchingAssetId = repairMappedAsset ? yield* findAssetBySymbol(asset) : undefined;
      if (matchingAssetId !== undefined && matchingAssetId !== mapped[0].asset_id) {
        yield* mergeAssets(mapped[0].asset_id, matchingAssetId);
        yield* attachConnectorIdentifiers(matchingAssetId, asset.identifiers);
        return matchingAssetId;
      }
      yield* attachConnectorIdentifiers(mapped[0].asset_id, asset.identifiers);
      return mapped[0].asset_id;
    }

    let assetId: string | undefined;
    for (const identifier of asset.identifiers) {
      const matched = yield* sql<{
        readonly asset_id: string;
      }>`SELECT asset_id FROM asset_identifiers
        WHERE identifier_type = ${identifier.type.trim()} AND identifier_value = ${identifier.value.trim()}`;
      if (matched[0] !== undefined) {
        assetId = matched[0].asset_id;
        break;
      }
    }
    if (assetId === undefined) assetId = yield* findAssetBySymbol(asset);
    if (assetId === undefined) {
      assetId = randomUUID();
      const timestamp = new Date().toISOString();
      const name = yield* nonEmpty(asset.name, "Asset name");
      yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
        VALUES (${assetId}, ${asset.assetClass}, ${name}, ${asset.symbol?.trim() ?? null}, ${timestamp}, ${timestamp})`;
      for (const identifier of asset.identifiers) {
        yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
          VALUES (${randomUUID()}, ${assetId}, ${identifier.type.trim()}, ${identifier.value.trim()})`;
      }
    } else {
      yield* attachConnectorIdentifiers(assetId, asset.identifiers);
    }
    yield* sql`INSERT INTO connector_asset_mappings (custodian_id, external_asset_id, asset_id)
      VALUES (${custodianId}, ${asset.externalAssetId}, ${assetId})`;
    return assetId;
  });

/**
 * Commits one normalized connector result atomically. Absence is destructive
 * only for a successful complete result; partial output never zeros or removes.
 */
export const reconcileConnector = (
  custodianId: string,
  output: NormalizedConnectorOutput,
): Effect.Effect<ReconciliationResult, FinanceApiError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const owner = yield* sql<{
      readonly management_mode: string;
      readonly connector_id: string | null;
    }>`SELECT
      c.management_mode, cc.connector_id FROM custodians c
      LEFT JOIN custodian_connectors cc ON cc.custodian_id = c.id WHERE c.id = ${custodianId}`;
    if (owner[0] === undefined) return yield* fail("not_found", "Custodian was not found");
    if (owner[0].management_mode !== "synced" || owner[0].connector_id === null) {
      return yield* fail("validation", "Only a configured synced custodian can be reconciled");
    }
    const connectorId = owner[0].connector_id;
    const externalAssetIds = new Set<string>();
    for (const asset of output.assets) {
      const externalId = yield* nonEmpty(asset.externalAssetId, "External asset ID");
      if (externalAssetIds.has(externalId))
        return yield* fail("validation", "Connector returned a duplicate external asset ID");
      externalAssetIds.add(externalId);
    }
    const externalAccountIds = new Set<string>();
    for (const account of output.accounts) {
      const externalId = yield* nonEmpty(account.externalAccountId, "External account ID");
      if (externalAccountIds.has(externalId))
        return yield* fail("validation", "Connector returned a duplicate external account ID");
      externalAccountIds.add(externalId);
      for (const position of account.positions)
        yield* finite(position.quantity, "Position quantity");
    }

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const assets = new Map<string, string>();
        for (const asset of output.assets)
          assets.set(
            asset.externalAssetId,
            yield* resolveAsset(custodianId, asset, output.complete),
          );
        const seenPositionIds: string[] = [];
        const seenAccountIds: string[] = [];
        let positionCount = 0;
        for (const account of output.accounts) {
          const name = yield* nonEmpty(account.name, "Account name");
          const currencyId = yield* ensureFiat(account.baseCurrencyIso);
          const timestamp = new Date().toISOString();
          const existing = yield* sql<{ readonly id: string }>`SELECT id FROM accounts
            WHERE custodian_id = ${custodianId} AND connector_account_id = ${account.externalAccountId}`;
          const accountId = existing[0]?.id ?? randomUUID();
          if (existing[0] === undefined) {
            yield* sql`INSERT INTO accounts
              (id, custodian_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
              VALUES (${accountId}, ${custodianId}, ${name}, ${currencyId}, ${account.externalAccountId}, ${timestamp}, ${timestamp})`;
          } else {
            yield* sql`UPDATE accounts SET name = ${name}, base_currency_asset_id = ${currencyId},
              updated_at = ${timestamp} WHERE id = ${accountId}`;
          }
          seenAccountIds.push(accountId);
          for (const position of account.positions) {
            const assetId = assets.get(position.externalAssetId);
            if (assetId === undefined)
              return yield* fail(
                "validation",
                "Position references an asset absent from connector output",
              );
            const existingPosition = yield* sql<{ readonly id: string }>`SELECT id FROM positions
              WHERE account_id = ${accountId} AND asset_id = ${assetId}`;
            const positionId = existingPosition[0]?.id ?? randomUUID();
            if (existingPosition[0] === undefined) {
              yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
                VALUES (${positionId}, ${accountId}, ${assetId}, ${position.quantity}, ${timestamp}, ${timestamp})`;
            } else {
              yield* sql`UPDATE positions SET quantity = ${position.quantity}, updated_at = ${timestamp}
                WHERE id = ${positionId}`;
            }
            if (position.reportedPrice !== undefined) {
              yield* finite(position.reportedPrice.price, "Reported price");
              const priceCurrencyId = yield* ensureFiat(position.reportedPrice.currencyIso);
              yield* sql`INSERT INTO asset_prices
                (asset_id, price, currency_asset_id, source, observed_at, updated_at)
                SELECT ${assetId}, ${position.reportedPrice.price}, ${priceCurrencyId}, ${`connector:${connectorId}`},
                  ${position.reportedPrice.observedAt.toISOString()}, ${timestamp}
                WHERE NOT EXISTS (SELECT 1 FROM asset_prices WHERE asset_id = ${assetId})`;
            }
            seenPositionIds.push(positionId);
            positionCount += 1;
          }
        }
        let zeroedPositionCount = 0;
        let removedAccountCount = 0;
        if (output.complete) {
          const missingPositions =
            seenPositionIds.length === 0
              ? yield* sql<{
                  readonly id: string;
                }>`SELECT p.id FROM positions p JOIN accounts a ON a.id = p.account_id
                WHERE a.custodian_id = ${custodianId}`
              : yield* sql<{
                  readonly id: string;
                }>`SELECT p.id FROM positions p JOIN accounts a ON a.id = p.account_id
                WHERE a.custodian_id = ${custodianId} AND p.id NOT IN ${sql.in(seenPositionIds)}`;
          zeroedPositionCount = missingPositions.length;
          for (const { id } of missingPositions)
            yield* sql`UPDATE positions SET quantity = 0, updated_at = ${new Date().toISOString()} WHERE id = ${id}`;
          const missingAccounts =
            seenAccountIds.length === 0
              ? yield* sql<{
                  readonly id: string;
                }>`SELECT id FROM accounts WHERE custodian_id = ${custodianId}`
              : yield* sql<{
                  readonly id: string;
                }>`SELECT id FROM accounts WHERE custodian_id = ${custodianId}
                AND id NOT IN ${sql.in(seenAccountIds)}`;
          removedAccountCount = missingAccounts.length;
          for (const { id } of missingAccounts) yield* sql`DELETE FROM accounts WHERE id = ${id}`;
        }
        yield* sql`UPDATE custodian_connectors SET last_synced_at = ${new Date().toISOString()},
          updated_at = ${new Date().toISOString()} WHERE custodian_id = ${custodianId}`;
        return {
          accountCount: output.accounts.length,
          positionCount,
          zeroedPositionCount,
          removedAccountCount,
        };
      }),
    );
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof FinanceApiError
        ? cause
        : new FinanceApiError({ code: "database", message: "Connector reconciliation failed" }),
    ),
    Effect.catchAllDefect(() => fail("database", "Connector reconciliation failed")),
  );
