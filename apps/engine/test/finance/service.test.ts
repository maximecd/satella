import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";
import * as Finance from "@engine/finance/service";

const directories: string[] = [];

const run = async <A>(program: Effect.Effect<A, unknown, SqlClient.SqlClient>) => {
  const directory = await mkdtemp(join(tmpdir(), "optimus-finance-"));
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

describe("finance domain service", () => {
  it("creates manual custodians with several fiat-based accounts", async () => {
    const result = await run(
      Effect.gen(function* () {
        const custodian = yield* Finance.createCustodian({
          name: "My bank",
          managementMode: "manual",
        });
        const checking = yield* Finance.createAccount({
          custodianId: custodian.id,
          name: "Checking",
        });
        const savings = yield* Finance.createAccount({
          custodianId: custodian.id,
          name: "Savings",
          baseCurrencyAssetId: "fiat:USD",
        });
        return { custodian: yield* Finance.getCustodian(custodian.id), checking, savings };
      }),
    );

    expect(result.custodian.accounts).toHaveLength(2);
    expect(result.checking.baseCurrencyIso).toBe("USD");
    expect(result.savings.baseCurrencyIso).toBe("USD");
  });

  it("reuses strong identifiers but never merges by name or ticker alone", async () => {
    const assets = await run(
      Effect.gen(function* () {
        const apple = yield* Finance.createAsset({
          assetClass: "security",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        });
        const sameApple = yield* Finance.createAsset({
          assetClass: "security",
          name: "Apple Inc.",
          symbol: "AAPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        });
        const ambiguousApple = yield* Finance.createAsset({
          assetClass: "security",
          name: "Apple",
          symbol: "AAPL",
          identifiers: [],
        });
        return { apple, sameApple, ambiguousApple };
      }),
    );

    expect(assets.sameApple.id).toBe(assets.apple.id);
    expect(assets.ambiguousApple.id).not.toBe(assets.apple.id);
  });

  it("enforces finite unique positions and keeps zero quantities", async () => {
    const fixture = await run(
      Effect.gen(function* () {
        const custodian = yield* Finance.createCustodian({
          name: "Wallet",
          managementMode: "manual",
        });
        const account = yield* Finance.createAccount({
          custodianId: custodian.id,
          name: "Default",
        });
        const custom = yield* Finance.createAsset({
          assetClass: "custom",
          name: "Collectible",
          identifiers: [],
        });
        const withPosition = yield* Finance.createPosition({
          accountId: account.id,
          assetId: custom.id,
          quantity: -2,
        });
        const position = withPosition.positions[0]!;
        const zeroed = yield* Finance.updatePosition(position.id, 0);
        const invalidMessage = yield* Finance.createPosition({
          accountId: account.id,
          assetId: "fiat:USD",
          quantity: Number.POSITIVE_INFINITY,
        }).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        return { zeroed, invalidMessage };
      }),
    );

    expect(fixture.zeroed.positions[0]?.quantity).toBe(0);
    expect(fixture.invalidMessage).toContain("Quantity must be finite");
  });

  it("uses one shared custom price across custodians and marks missing prices incomplete", async () => {
    const result = await run(
      Effect.gen(function* () {
        const asset = yield* Finance.createAsset({
          assetClass: "custom",
          name: "Private company",
          identifiers: [],
        });
        const firstCustodian = yield* Finance.createCustodian({
          name: "First",
          managementMode: "manual",
        });
        const secondCustodian = yield* Finance.createCustodian({
          name: "Second",
          managementMode: "manual",
        });
        const first = yield* Finance.createAccount({
          custodianId: firstCustodian.id,
          name: "Default",
        });
        const second = yield* Finance.createAccount({
          custodianId: secondCustodian.id,
          name: "Default",
        });
        yield* Finance.createPosition({ accountId: first.id, assetId: asset.id, quantity: 2 });
        const beforePrice = yield* Finance.createPosition({
          accountId: second.id,
          assetId: asset.id,
          quantity: 3,
        });
        yield* Finance.setManualPrice(asset.id, { price: 10, currencyAssetId: "fiat:USD" });
        return {
          beforePrice,
          first: yield* Finance.getAccount(first.id),
          second: yield* Finance.getAccount(second.id),
        };
      }),
    );

    expect(result.beforePrice.totalIncomplete).toBe(true);
    expect(result.first.total).toBeCloseTo(20);
    expect(result.second.total).toBeCloseTo(30);
    expect(result.first.positions[0]?.price?.price).toBe(10);
    expect(result.second.positions[0]?.price?.price).toBe(10);
  });

  it("rejects synced creation without a registered connector and protects synced writes", async () => {
    await expect(
      run(
        Finance.createCustodian({ name: "Synced", managementMode: "synced", connectorId: "fake" }),
      ),
    ).rejects.toThrow("No registered custodian connector");

    await expect(
      run(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const timestamp = new Date().toISOString();
          yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
            VALUES ('synced', 'Fixture', 'synced', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO custodian_connectors
            (custodian_id, connector_id, config_json, created_at, updated_at)
            VALUES ('synced', 'test-only', '{}', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO accounts
            (id, custodian_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
            VALUES ('synced-account', 'synced', 'External', 'fiat:USD', 'upstream-1', ${timestamp}, ${timestamp})`;
          yield* Finance.updateAccount("synced-account", {
            name: "Changed",
            baseCurrencyAssetId: "fiat:USD",
          });
        }),
      ),
    ).rejects.toThrow("read-only");
  });

  it("captures current quantities and selected prices atomically", async () => {
    const result = await run(
      Effect.gen(function* () {
        const custodian = yield* Finance.createCustodian({
          name: "Snapshot",
          managementMode: "manual",
        });
        const account = yield* Finance.createAccount({
          custodianId: custodian.id,
          name: "Default",
        });
        const asset = yield* Finance.createAsset({
          assetClass: "custom",
          name: "Art",
          identifiers: [],
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: 1 });
        yield* Finance.setManualPrice(asset.id, { price: 500, currencyAssetId: "fiat:USD" });
        const snapshot = yield* Finance.captureSnapshot();
        const history = yield* Finance.getPortfolioHistory();
        return { snapshot, history };
      }),
    );

    expect(result.snapshot.positionCount).toBe(1);
    expect(result.snapshot.priceCount).toBe(1);
    expect(Date.parse(result.snapshot.capturedAt)).not.toBeNaN();
    expect(result.history).toEqual([
      expect.objectContaining({ total: 500, totalIncomplete: false }),
    ]);
  });

  it("does not fabricate another snapshot before the configured daily interval", async () => {
    const result = await run(
      Effect.gen(function* () {
        const first = yield* Finance.captureSnapshotIfDue({
          now: () => new Date("2026-08-11T00:00:00.000Z"),
        });
        const second = yield* Finance.captureSnapshotIfDue({
          now: () => new Date("2026-08-11T01:00:00.000Z"),
        });
        return { first, second };
      }),
    );
    expect(result.first).not.toBeNull();
    expect(result.second).toBeNull();
  });
});
