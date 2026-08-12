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

const run = async <A>(program: Effect.Effect<A, unknown, SqlClient.SqlClient>) => {
  const directory = await mkdtemp(join(tmpdir(), "optimus-add-assets-"));
  directories.push(directory);
  return Effect.runPromise(
    Effect.scoped(
      program.pipe(
        Effect.provide(
          makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
        ),
      ),
    ),
  );
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("add assets operations", () => {
  it("creates a securities holding under a new manual custodian and account", async () => {
    const result = await run(
      Effect.gen(function* () {
        const created = yield* Finance.addManualHolding({
          asset: {
            assetClass: "security",
            name: "Apple",
            symbol: "AAPL",
            identifiers: [{ type: "isin", value: "US0378331005" }],
          },
          custodian: { type: "new", name: "My broker" },
          account: { type: "new", name: "PEA" },
          quantity: 3,
        });
        const account = yield* Finance.getAccount(created.accountId);
        const custodians = yield* Finance.listManualCustodians();
        return { created, account, custodians };
      }),
    );

    expect(result.created.positionOutcome).toBe("created");
    expect(result.account.accountKind).toBe("securities");
    expect(result.account.positions[0]?.quantity).toBe(3);
    expect(result.custodians).toHaveLength(1);
    expect(result.custodians[0]?.name).toBe("My broker");
  });

  it("updates the absolute quantity when the same asset is re-added to one account", async () => {
    const result = await run(
      Effect.gen(function* () {
        const first = yield* Finance.addManualHolding({
          asset: {
            assetClass: "crypto",
            name: "Bitcoin",
            symbol: "BTC",
            identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
          },
          custodian: { type: "new", name: "Wallet" },
          account: { type: "new", name: "Spot" },
          quantity: 1,
        });
        const second = yield* Finance.addManualHolding({
          asset: {
            assetClass: "crypto",
            name: "Bitcoin",
            symbol: "BTC",
            identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
          },
          custodian: { type: "existing", id: first.custodianId },
          account: { type: "existing", id: first.accountId },
          quantity: 2.5,
        });
        const lookup = yield* Finance.lookupManualHolding(
          first.accountId,
          "coingecko_coin_id",
          "bitcoin",
        );
        return { first, second, lookup, account: yield* Finance.getAccount(first.accountId) };
      }),
    );

    expect(result.second.positionOutcome).toBe("updated");
    expect(result.account.positions).toHaveLength(1);
    expect(result.account.positions[0]?.quantity).toBe(2.5);
    expect(result.lookup.quantity).toBe(2.5);
  });

  it("allows the same security in several accounts and duplicate custodian names", async () => {
    const result = await run(
      Effect.gen(function* () {
        const first = yield* Finance.addManualHolding({
          asset: {
            assetClass: "security",
            name: "Apple",
            symbol: "AAPL",
            identifiers: [{ type: "isin", value: "US0378331005" }],
          },
          custodian: { type: "new", name: "Broker" },
          account: { type: "new", name: "Compte-titres" },
          quantity: 1,
        });
        const second = yield* Finance.addManualHolding({
          asset: {
            assetClass: "security",
            name: "Apple",
            symbol: "AAPL",
            identifiers: [{ type: "isin", value: "US0378331005" }],
          },
          custodian: { type: "new", name: "Broker" },
          account: { type: "new", name: "PEA" },
          quantity: 4,
        });
        return {
          first: yield* Finance.getAccount(first.accountId),
          second: yield* Finance.getAccount(second.accountId),
          custodians: yield* Finance.listCustodians(),
        };
      }),
    );

    expect(result.first.positions[0]?.assetId).toBe(result.second.positions[0]?.assetId);
    expect(result.first.positions[0]?.quantity).toBe(1);
    expect(result.second.positions[0]?.quantity).toBe(4);
    expect(result.custodians.map(({ name }) => name)).toEqual(["Broker", "Broker"]);
  });

  it("creates a current account and fiat balance atomically, including a negative balance", async () => {
    const result = await run(
      Finance.addCashAccount({
        accountKind: "current",
        custodian: { type: "new", name: "Bank" },
        accountName: "Checking",
        currencyAssetId: "fiat:EUR",
        balance: -25,
      }).pipe(
        Effect.flatMap((created) =>
          Finance.getAccount(created.accountId).pipe(Effect.map((account) => ({ created, account }))),
        ),
      ),
    );

    expect(result.account.accountKind).toBe("current");
    expect(result.account.baseCurrencyIso).toBe("EUR");
    expect(result.account.positions[0]?.assetId).toBe("fiat:EUR");
    expect(result.account.positions[0]?.quantity).toBe(-25);
  });

  it("creates an other asset without exposing system records in pickers", async () => {
    const result = await run(
      Effect.gen(function* () {
        const created = yield* Finance.addOtherAsset({
          name: "Watch",
          value: 1200,
          currencyAssetId: "fiat:USD",
        });
        const dashboard = yield* Finance.getDashboard();
        const pickers = yield* Finance.listManualCustodians();
        const listed = yield* Finance.listCustodians();
        const rename = yield* Finance.updateCustodian(created.custodianId, { name: "Changed" }).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        const remove = yield* Finance.deleteCustodian(created.custodianId).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        return { created, dashboard, pickers, listed, rename, remove };
      }),
    );

    expect(result.created.accountName).toBe("Other assets");
    expect(result.dashboard.accounts).toEqual([
      expect.objectContaining({
        accountName: "Other assets",
        custodianName: "",
        presentationRole: "direct_ownership",
        total: 1200,
      }),
    ]);
    expect(result.pickers).toEqual([]);
    expect(result.listed).toEqual([]);
    expect(result.rename).toContain("System-managed");
    expect(result.remove).toContain("System-managed");
  });

  it("rolls back a failed other-asset write and rejects synced destinations", async () => {
    const result = await run(
      Effect.gen(function* () {
        const before = yield* Finance.listAssets();
        const invalid = yield* Finance.addOtherAsset({
          name: "Broken",
          value: Number.POSITIVE_INFINITY,
          currencyAssetId: "fiat:USD",
        }).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        const after = yield* Finance.listAssets();
        const sql = yield* SqlClient.SqlClient;
        const timestamp = new Date().toISOString();
        yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
          VALUES ('synced', 'OKX', 'synced', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO custodian_connectors
          (custodian_id, connector_id, config_json, created_at, updated_at)
          VALUES ('synced', 'okx', '{}', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO accounts
          (id, custodian_id, name, account_kind, base_currency_asset_id, connector_account_id, created_at, updated_at)
          VALUES ('trading', 'synced', 'Trading', 'crypto', 'fiat:USD', 'trading', ${timestamp}, ${timestamp})`;
        const syncedWrite = yield* Finance.addManualHolding({
          asset: {
            assetClass: "crypto",
            name: "Bitcoin",
            symbol: "BTC",
            identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
          },
          custodian: { type: "existing", id: "synced" },
          account: { type: "existing", id: "trading" },
          quantity: 1,
        }).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        return { invalid, beforeCount: before.length, afterCount: after.length, syncedWrite };
      }),
    );

    expect(result.invalid).toContain("finite");
    expect(result.afterCount).toBe(result.beforeCount);
    expect(result.syncedWrite).toContain("read-only");
  });

  it("imports mixed asset classes from a connector discovered for one class", async () => {
    const account = await run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const timestamp = new Date().toISOString();
        yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
          VALUES ('ibkr', 'IBKR', 'synced', ${timestamp}, ${timestamp})`;
        yield* sql`INSERT INTO custodian_connectors
          (custodian_id, connector_id, config_json, created_at, updated_at)
          VALUES ('ibkr', 'ibkr', '{}', ${timestamp}, ${timestamp})`;
        yield* reconcileConnector("ibkr", {
          complete: true,
          assets: [
            {
              externalAssetId: "ibkr:conid:1",
              assetClass: "security",
              name: "Apple",
              symbol: "AAPL",
              identifiers: [{ type: "ibkr_conid", value: "1" }],
            },
            {
              externalAssetId: "ibkr:conid:2",
              assetClass: "crypto",
              name: "Bitcoin",
              symbol: "BTC",
              identifiers: [{ type: "ibkr_conid", value: "2" }],
            },
          ],
          accounts: [
            {
              externalAccountId: "U1",
              name: "Portfolio",
              baseCurrencyIso: "USD",
              accountKind: "securities",
              positions: [
                { externalAssetId: "ibkr:conid:1", quantity: 2 },
                { externalAssetId: "ibkr:conid:2", quantity: 0.5 },
              ],
            },
          ],
        });
        const custodian = yield* Finance.getCustodian("ibkr");
        return yield* Finance.getAccount(custodian.accounts[0]!.id);
      }),
    );

    expect(account.accountKind).toBe("securities");
    expect(account.positions.map(({ assetClass }) => assetClass).sort()).toEqual(["crypto", "security"]);
  });
});
