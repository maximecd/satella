import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";
import type {
  MarketDataProvider,
  MarketDataRegistry,
  ProviderLookup,
} from "@engine/finance/market-data";
import { refreshPrices } from "@engine/finance/market-data";
import * as Finance from "@engine/finance/service";

const directories: string[] = [];
const run = async <A>(program: Effect.Effect<A, unknown, SqlClient.SqlClient>) => {
  const directory = await mkdtemp(join(tmpdir(), "optimus-market-data-"));
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

describe("market data coordinator", () => {
  it("deduplicates provider lookups, persists partial success, and reuses fresh observations", async () => {
    const batches: Array<ReadonlyArray<ProviderLookup>> = [];
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: (lookups) => {
        batches.push(lookups);
        return Effect.succeed({
          observations: lookups
            .filter(({ lookupKey }) => lookupKey === "AAPL")
            .map(({ lookupKey }) => ({
              lookupKey,
              price: 200,
              currencyIso: "USD",
              observedAt: new Date(),
            })),
          failures: lookups
            .filter(({ lookupKey }) => lookupKey !== "AAPL")
            .map(({ lookupKey }) => ({
              lookupKey,
              category: "not-found" as const,
              message: "Unknown symbol",
            })),
        });
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);

    const result = await run(
      Effect.gen(function* () {
        const apple = yield* Finance.createAsset({
          assetClass: "security",
          name: "Apple",
          identifiers: [{ type: "yahoo_symbol", value: "AAPL" }],
        });
        const unknown = yield* Finance.createAsset({
          assetClass: "security",
          name: "Unknown",
          identifiers: [{ type: "yahoo_symbol", value: "UNKNOWN" }],
        });
        const firstCustodian = yield* Finance.createCustodian({
          name: "One",
          managementMode: "manual",
        });
        const secondCustodian = yield* Finance.createCustodian({
          name: "Two",
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
        yield* Finance.createPosition({ accountId: first.id, assetId: apple.id, quantity: 1 });
        yield* Finance.createPosition({ accountId: second.id, assetId: apple.id, quantity: 2 });
        yield* Finance.createPosition({ accountId: first.id, assetId: unknown.id, quantity: 1 });
        const refreshed = yield* refreshPrices({ registry, requireFresh: true });
        const valued = yield* Finance.getAccount(second.id);
        const freshPass = yield* refreshPrices({ registry });
        return { apple, unknown, refreshed, valued, freshPass };
      }),
    );

    expect(batches[0]?.map(({ lookupKey }) => lookupKey).sort()).toEqual(["AAPL", "UNKNOWN"]);
    expect(batches[0]?.find(({ lookupKey }) => lookupKey === "AAPL")?.assetIds).toHaveLength(1);
    expect(result.refreshed.refreshedAssetIds).toEqual([result.apple.id]);
    expect(result.refreshed.failures).toEqual([
      expect.objectContaining({ assetId: result.unknown.id, category: "not-found" }),
    ]);
    expect(result.valued.total).toBe(400);
    expect(result.freshPass.refreshedAssetIds).toEqual([]);
    expect(batches).toHaveLength(2);
    expect(batches[1]?.map(({ lookupKey }) => lookupKey)).toEqual(["UNKNOWN"]);
  });

  it("never sends custom assets to a provider", async () => {
    let requests = 0;
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: () => {
        requests += 1;
        return Effect.succeed({ observations: [], failures: [] });
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);
    const result = await run(
      Effect.gen(function* () {
        const custom = yield* Finance.createAsset({
          assetClass: "custom",
          name: "Art",
          identifiers: [],
        });
        const custodian = yield* Finance.createCustodian({
          name: "Home",
          managementMode: "manual",
        });
        const account = yield* Finance.createAccount({
          custodianId: custodian.id,
          name: "Default",
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: custom.id, quantity: 1 });
        return yield* refreshPrices({ registry, requireFresh: true });
      }),
    );
    expect(result.refreshedAssetIds).toEqual([]);
    expect(requests).toBe(0);
  });

  it("coalesces simultaneous refreshes for the same provider lookup", async () => {
    let requests = 0;
    const yahoo: MarketDataProvider = {
      id: "yahoo-finance",
      chunkSize: 50,
      fetchPrices: (lookups) => {
        requests += 1;
        return Effect.sleep("20 millis").pipe(
          Effect.as({
            observations: lookups.map(({ lookupKey }) => ({
              lookupKey,
              price: 100,
              currencyIso: "USD",
              observedAt: new Date(),
            })),
            failures: [],
          }),
        );
      },
    };
    const registry: MarketDataRegistry = new Map([["yahoo-finance", yahoo]]);
    await run(
      Effect.gen(function* () {
        const asset = yield* Finance.createAsset({
          assetClass: "security",
          name: "Shared",
          identifiers: [{ type: "yahoo_symbol", value: "SHARED" }],
        });
        const custodian = yield* Finance.createCustodian({
          name: "Broker",
          managementMode: "manual",
        });
        const account = yield* Finance.createAccount({
          custodianId: custodian.id,
          name: "Default",
        });
        yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: 1 });
        yield* Effect.all(
          [
            refreshPrices({ registry, requireFresh: true }),
            refreshPrices({ registry, requireFresh: true }),
          ],
          { concurrency: "unbounded" },
        );
      }),
    );
    expect(requests).toBe(1);
  });
});
