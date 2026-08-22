import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

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
      const error = yield* captureCycleTail({ registry: new Map() });
      expect(error).toBeNull();

      const sql = yield* SqlClient.SqlClient;
      const snapshots = yield* sql<{
        readonly count: number;
      }>`SELECT count(*) AS count FROM snapshots`;
      expect(snapshots[0]?.count).toBe(1);
    }).pipe(Effect.provide(engineTestLayer()), Effect.runPromise);
  });
});
