import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";
import { reconcileConnector } from "@engine/finance/connector";
import * as Finance from "@engine/finance/service";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("connector reconciliation", () => {
  it("repairs an existing connector mapping with the automatic asset lookup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-connector-repair-"));
    directories.push(directory);
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const automatic = yield* Finance.createAsset({
            assetClass: "crypto",
            name: "Bitcoin",
            symbol: "BTC",
            identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
          });
          const legacy = yield* Finance.createAsset({
            assetClass: "crypto",
            name: "BTC",
            symbol: "BTC",
            identifiers: [{ type: "okx_currency", value: "BTC" }],
          });
          const timestamp = new Date().toISOString();
          yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
            VALUES ('synced', 'Broker', 'synced', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO custodian_connectors
            (custodian_id, connector_id, config_json, created_at, updated_at)
            VALUES ('synced', 'okx', '{}', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO accounts
            (id, custodian_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
            VALUES ('trading', 'synced', 'Trading', 'fiat:USD', 'trading', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
            VALUES ('btc-position', 'trading', ${legacy.id}, 1, ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO connector_asset_mappings (custodian_id, external_asset_id, asset_id)
            VALUES ('synced', 'okx:currency:BTC', ${legacy.id})`;
          yield* reconcileConnector("synced", {
            complete: true,
            assets: [
              {
                externalAssetId: "okx:currency:BTC",
                assetClass: "crypto",
                name: "BTC",
                symbol: "BTC",
                identifiers: [{ type: "okx_currency", value: "BTC" }],
              },
            ],
            accounts: [
              {
                externalAccountId: "trading",
                name: "Trading",
                baseCurrencyIso: "USD",
                accountKind: "crypto",
                positions: [{ externalAssetId: "okx:currency:BTC", quantity: 2 }],
              },
            ],
          });
          return {
            automatic: yield* Finance.getAsset(automatic.id),
            legacyId: legacy.id,
            assets: yield* Finance.listAssets(),
            account: yield* Finance.getAccount("trading"),
          };
        }).pipe(
          Effect.provide(
            makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
          ),
        ),
      ),
    );

    expect(result.assets.some(({ id }) => id === result.legacyId)).toBe(false);
    expect(result.automatic.identifiers).toEqual(
      expect.arrayContaining([
        { type: "coingecko_coin_id", value: "bitcoin" },
        { type: "okx_currency", value: "BTC" },
      ]),
    );
    expect(result.account.positions.find(({ quantity }) => quantity !== 0)?.assetId).toBe(
      result.automatic.id,
    );
  });

  it("reuses an existing automatic asset when a connector symbol matches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-connector-symbol-"));
    directories.push(directory);
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const bitcoin = yield* Finance.createAsset({
            assetClass: "crypto",
            name: "Bitcoin",
            symbol: "BTC",
            identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
          });
          const timestamp = new Date().toISOString();
          yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
            VALUES ('synced', 'Broker', 'synced', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO custodian_connectors
            (custodian_id, connector_id, config_json, created_at, updated_at)
            VALUES ('synced', 'okx', '{}', ${timestamp}, ${timestamp})`;
          yield* reconcileConnector("synced", {
            complete: true,
            assets: [
              {
                externalAssetId: "okx:currency:BTC",
                assetClass: "crypto",
                name: "BTC",
                symbol: "BTC",
                identifiers: [{ type: "okx_currency", value: "BTC" }],
              },
            ],
            accounts: [
              {
                externalAccountId: "trading",
                name: "Trading",
                baseCurrencyIso: "USD",
                accountKind: "crypto",
                positions: [{ externalAssetId: "okx:currency:BTC", quantity: 1 }],
              },
            ],
          });
          const custodian = yield* Finance.getCustodian("synced");
          const account = yield* Finance.getAccount(custodian.accounts[0]!.id);
          return { bitcoin, account };
        }).pipe(
          Effect.provide(
            makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
          ),
        ),
      ),
    );

    expect(result.account.positions[0]?.assetId).toBe(result.bitcoin.id);
  });

  it("upserts stable identities and reconciles absence only after complete output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-connector-"));
    directories.push(directory);
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const timestamp = new Date().toISOString();
          yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
            VALUES ('synced', 'Broker', 'synced', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO custodian_connectors
            (custodian_id, connector_id, config_json, created_at, updated_at)
            VALUES ('synced', 'fixture', '{}', ${timestamp}, ${timestamp})`;
          const asset = {
            externalAssetId: "instrument-1",
            assetClass: "security" as const,
            name: "Apple",
            symbol: "AAPL",
            identifiers: [{ type: "isin", value: "US0378331005" }],
          };
          yield* reconcileConnector("synced", {
            complete: true,
            assets: [asset],
            accounts: [
              {
                externalAccountId: "account-1",
                name: "Portfolio",
                baseCurrencyIso: "USD",
                accountKind: "securities",
                positions: [{ externalAssetId: "instrument-1", quantity: 4 }],
              },
            ],
          });
          const created = yield* Finance.getCustodian("synced");
          const accountId = created.accounts[0]!.id;
          yield* reconcileConnector("synced", { complete: false, assets: [], accounts: [] });
          const afterPartial = yield* Finance.getAccount(accountId);
          const zeroResult = yield* reconcileConnector("synced", {
            complete: true,
            assets: [asset],
            accounts: [
              {
                externalAccountId: "account-1",
                name: "Renamed portfolio",
                baseCurrencyIso: "USD",
                accountKind: "securities",
                positions: [],
              },
            ],
          });
          const zeroed = yield* Finance.getAccount(accountId);
          const removeResult = yield* reconcileConnector("synced", {
            complete: true,
            assets: [],
            accounts: [],
          });
          const finalCustodian = yield* Finance.getCustodian("synced");
          return { afterPartial, zeroResult, zeroed, removeResult, finalCustodian };
        }).pipe(
          Effect.provide(
            makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
          ),
        ),
      ),
    );

    expect(result.afterPartial.positions[0]?.quantity).toBe(4);
    expect(result.zeroResult.zeroedPositionCount).toBe(1);
    expect(result.zeroed.name).toBe("Renamed portfolio");
    expect(result.zeroed.positions[0]?.quantity).toBe(0);
    expect(result.removeResult.removedAccountCount).toBe(1);
    expect(result.finalCustodian.accounts).toEqual([]);
  });
});
