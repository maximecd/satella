import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SqlClient } from "effect/unstable/sql";
import * as TestClock from "effect/testing/TestClock";
import * as Schema from "effect/Schema";
import { ConnectorAuthenticationError, connectorRegistryFrom } from "@satella-app/connector-core";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";
import type { VaultStatus } from "../../vault/Vault.js";
import { VaultService } from "../../vault/Vault.js";
import { layer as VaultEventsLive, VaultEvents } from "../../vault/VaultEvents.js";
import { AUTO_REFRESH_INTERVAL } from "../config.js";
import type { MarketDataProvider } from "../market-data.js";
import { FailureLog } from "./FailureLog.js";
import { layer as RefreshQueueLive } from "./RefreshQueue.js";
import { AutoRefreshScheduler } from "./AutoRefresh.js";
import { layer as AutoRefreshLive } from "./AutoRefresh.js";

const OPEN_STATUS: VaultStatus = {
  state: "open",
  screenLock: false,
  pinAttemptsRemaining: 3,
  pinEntryDisabled: false,
  screenLockTimeoutMinutes: 5,
};
const LOCKED_STATUS: VaultStatus = { state: "locked" };

const unexpected = (method: string) => Effect.die(`unexpected VaultService.${method} call`);

const makeFailureLog = () => {
  const entries: Array<{ custodian: string; code: string }> = [];
  const layer = Layer.succeed(
    FailureLog,
    FailureLog.of({
      record: (entry) =>
        Effect.sync(() => {
          entries.push({ custodian: entry.custodianId, code: entry.code });
        }),
    }),
  );
  return { entries, layer };
};

describe("auto-refresh", () => {
  it.effect("reconciles every custodian before one shared completion tail", () => {
    let failedToken: string | undefined;
    const connectorRegistry = connectorRegistryFrom([
      {
        id: "test-only",
        name: "Test connector",
        assetCategories: ["crypto" as const],
        credentialFields: [],
        credentialsSchema: Schema.Unknown,
        authenticate: (credentials) => {
          if (credentials.token === failedToken) {
            return Effect.fail(
              new ConnectorAuthenticationError({
                category: "network",
                message: "fixture failure",
              }),
            );
          }
          return Effect.succeed({
            fetchAccounts: () =>
              Effect.succeed([
                {
                  externalId: `account-${credentials.token}`,
                  name: "Test account",
                  baseCurrencyIso: "USD",
                  positions: [
                    {
                      asset: {
                        externalId: "test:bitcoin",
                        assetCategory: "crypto" as const,
                        name: "Bitcoin",
                        symbol: "BTC",
                        identifiers: [{ type: "coingecko_coin_id", value: "bitcoin" }],
                      },
                      quantity: "1",
                    },
                  ],
                },
              ]),
          });
        },
      },
    ]);
    const failures = makeFailureLog();
    let marketDataCalls = 0;
    const marketDataProvider: MarketDataProvider = {
      id: "coingecko",
      chunkSize: 500,
      fetchPrices: () =>
        Effect.sync(() => {
          marketDataCalls += 1;
          return { observations: [], failures: [] };
        }),
    };
    const marketDataRegistry = new Map<"yahoo-finance" | "coingecko", MarketDataProvider>([
      ["coingecko", marketDataProvider],
    ]);
    const fakeVault = Layer.effect(
      VaultService,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return VaultService.of({
          status: () => Effect.succeed(OPEN_STATUS),
          currentSql: () => Effect.succeed(sql),
          initialize: () => unexpected("initialize"),
          unlock: () => unexpected("unlock"),
          close: () => unexpected("close"),
          lockScreen: () => unexpected("lockScreen"),
          unlockScreen: () => unexpected("unlockScreen"),
          unlockScreenWithPassword: () => unexpected("unlockScreenWithPassword"),
          changePassword: () => unexpected("changePassword"),
          changePin: () => unexpected("changePin"),
          setScreenLockTimeout: () => unexpected("setScreenLockTimeout"),
          verifyPassword: () => unexpected("verifyPassword"),
          reportActivity: () => unexpected("reportActivity"),
          reset: () => unexpected("reset"),
          assertRendererFinanceAccess: () => unexpected("assertRendererFinanceAccess"),
          assertOpenVault: () => unexpected("assertOpenVault"),
          exportVault: () => unexpected("exportVault"),
          restoreVault: () => unexpected("restoreVault"),
        });
      }),
    );

    return Effect.gen(function* () {
      for (const id of ["one", "two", "three"]) {
        yield* Finance.seedSyncedCustodian({
          id,
          name: id,
          connectorId: "test-only",
          credentials: { token: id },
        });
      }
      const scheduler = yield* AutoRefreshScheduler;
      const events = yield* VaultEvents;
      yield* events.notifyUnlocked();
      yield* waitForCycles(1);
      expect(marketDataCalls).toBe(1);
      expect(yield* snapshotCount).toBe(1);
      expect(yield* scheduler.status()).toMatchObject({ lastCycleOutcome: "success" });

      failedToken = "two";
      yield* TestClock.adjust(AUTO_REFRESH_INTERVAL);
      yield* waitForCycles(2);
      expect(marketDataCalls).toBe(2);
      expect(yield* snapshotCount).toBe(2);
      expect(yield* scheduler.status()).toMatchObject({ lastCycleOutcome: "partial" });
      expect(failures.entries).toEqual([{ custodian: "two", code: "validation" }]);
    }).pipe(
      Effect.provide(
        AutoRefreshLive({ registry: marketDataRegistry, connectorRegistry }).pipe(
          Layer.provideMerge(fakeVault.pipe(Layer.provideMerge(engineTestLayer()))),
          Layer.provideMerge(failures.layer),
          Layer.provideMerge(VaultEventsLive),
          Layer.provideMerge(RefreshQueueLive),
        ),
      ),
    );
  });

  it.effect("cycles on unlock and per tick, stops when the vault closes, resumes on unlock", () => {
    const failures = makeFailureLog();
    const vaultControl = { open: true };
    const fakeVault = Layer.effect(
      VaultService,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return VaultService.of({
          status: () => Effect.sync(() => (vaultControl.open ? OPEN_STATUS : LOCKED_STATUS)),
          currentSql: () => Effect.succeed(sql),
          initialize: () => unexpected("initialize"),
          unlock: () => unexpected("unlock"),
          close: () => unexpected("close"),
          lockScreen: () => unexpected("lockScreen"),
          unlockScreen: () => unexpected("unlockScreen"),
          unlockScreenWithPassword: () => unexpected("unlockScreenWithPassword"),
          changePassword: () => unexpected("changePassword"),
          changePin: () => unexpected("changePin"),
          setScreenLockTimeout: () => unexpected("setScreenLockTimeout"),
          verifyPassword: () => unexpected("verifyPassword"),
          reportActivity: () => unexpected("reportActivity"),
          reset: () => unexpected("reset"),
          assertRendererFinanceAccess: () => unexpected("assertRendererFinanceAccess"),
          assertOpenVault: () => unexpected("assertOpenVault"),
          exportVault: () => unexpected("exportVault"),
          restoreVault: () => unexpected("restoreVault"),
        });
      }),
    );

    return Effect.gen(function* () {
      yield* Finance.seedSyncedCustodian({
        id: "okx",
        name: "OKX",
        connectorId: "test-only",
        credentials: { token: "x" },
      });
      const scheduler = yield* AutoRefreshScheduler;
      const events = yield* VaultEvents;
      expect(yield* scheduler.status()).toEqual({ lastCycleAt: null, lastCycleOutcome: null });

      yield* events.notifyUnlocked();
      yield* waitForCycles(1);
      expect(yield* snapshotCount).toBe(1);
      expect(yield* scheduler.status()).toMatchObject({
        lastCycleOutcome: "failed",
      });
      expect(failures.entries).toEqual([{ custodian: "okx", code: "connector_unavailable" }]);

      yield* settle();
      yield* TestClock.adjust(AUTO_REFRESH_INTERVAL);
      yield* waitForCycles(2);

      vaultControl.open = false;
      yield* settle();
      yield* TestClock.adjust(AUTO_REFRESH_INTERVAL);
      yield* settle();
      yield* TestClock.adjust(AUTO_REFRESH_INTERVAL);
      expect(yield* snapshotCount).toBe(2);
      expect(failures.entries).toHaveLength(2);

      vaultControl.open = true;
      yield* events.notifyUnlocked();
      yield* waitForCycles(3);
      expect(failures.entries).toHaveLength(3);
    }).pipe(
      Effect.provide(
        AutoRefreshLive({ registry: new Map() }).pipe(
          Layer.provideMerge(fakeVault.pipe(Layer.provideMerge(engineTestLayer()))),
          Layer.provideMerge(failures.layer),
          Layer.provideMerge(VaultEventsLive),
          Layer.provideMerge(RefreshQueueLive),
        ),
      ),
    );
  });
});

const snapshotCount = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly count: number }>`SELECT count(*) AS count FROM snapshots`;
  return rows[0]?.count ?? 0;
});

const waitForCycles = (count: number) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      if ((yield* snapshotCount) >= count) return;
      yield* Effect.yieldNow;
    }
    return yield* Effect.die(new Error(`Timed out waiting for ${count} refresh cycles`));
  });

/** Lets the daemon reach its next suspension point before advancing the clock. */
const settle = () =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 5000; attempt += 1) {
      yield* Effect.yieldNow;
    }
  });
