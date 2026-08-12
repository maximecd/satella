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
