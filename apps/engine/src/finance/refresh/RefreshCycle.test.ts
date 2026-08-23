import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SqlClient } from "effect/unstable/sql";
import { connectorRegistryFrom } from "@satella-app/connector-core";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";
import { captureCycleTail, listSyncedCustodianIds } from "./RefreshCycle.js";

describe("refresh cycle steps", () => {
  it("lists every synced custodian oldest first and skips manual ones", () => {
    return Effect.gen(function* () {
      yield* Finance.createCustodian({ name: "Manual bank" });
      yield* Finance.seedSyncedCustodian({
        id: "okx",
        name: "OKX",
        connectorId: "test-only",
        credentials: { token: "x" },
      });
      yield* Finance.seedSyncedCustodian({
        id: "kraken",
        name: "Kraken",
        connectorId: "also-test-only",
        credentials: { token: "y" },
      });

      const ids = yield* listSyncedCustodianIds();
      // Insertion order ties break on id, so only membership matters here.
      expect([...ids].sort()).toEqual(["kraken", "okx"]);
    }).pipe(Effect.provide(engineTestLayer()), Effect.runPromise);
  });

  it("closes the cycle with a snapshot even when the price step fails", () => {
    return Effect.gen(function* () {
      const completion = yield* captureCycleTail({ registry: new Map() });
      expect(completion.error).toBeNull();

      const sql = yield* SqlClient.SqlClient;
      const snapshots = yield* sql<{
        readonly count: number;
      }>`SELECT count(*) AS count FROM snapshots`;
      expect(snapshots[0]?.count).toBe(1);
    }).pipe(Effect.provide(engineTestLayer()), Effect.runPromise);
  });

  it("uses the connector cadence and persisted attempt time for eligibility", () => {
    return Effect.gen(function* () {
      yield* Finance.seedSyncedCustodian({
        id: "trade-republic",
        name: "Trade Republic",
        connectorId: "trade-republic",
        credentials: { sessionToken: "session", refreshToken: "refresh" },
      });
      const registry = connectorRegistryFrom([
        {
          id: "trade-republic",
          name: "Trade Republic",
          assetCategories: ["stocks_etfs" as const],
          autoRefreshIntervalMs: 6 * 60 * 60 * 1_000,
          credentialFields: [],
          credentialsSchema: Schema.Unknown,
          authenticate: () => Effect.die("unused"),
        },
      ]);
      const now = new Date("2026-08-23T12:00:00.000Z");
      const first = yield* listSyncedCustodianIds({ connectorRegistry: registry, now: () => now });
      expect(first).toEqual(["trade-republic"]);
      const sql = yield* SqlClient.SqlClient;
      yield* sql`UPDATE custodians SET last_refresh_attempt_at = ${new Date(
        now.getTime() - 5 * 60 * 60 * 1_000,
      ).toISOString()} WHERE id = 'trade-republic'`;
      expect(
        yield* listSyncedCustodianIds({ connectorRegistry: registry, now: () => now }),
      ).toEqual([]);
      yield* sql`UPDATE custodians SET last_refresh_attempt_at = ${new Date(
        now.getTime() - 6 * 60 * 60 * 1_000,
      ).toISOString()} WHERE id = 'trade-republic'`;
      expect(
        yield* listSyncedCustodianIds({ connectorRegistry: registry, now: () => now }),
      ).toEqual(["trade-republic"]);
    }).pipe(Effect.provide(engineTestLayer()), Effect.runPromise);
  });
});
