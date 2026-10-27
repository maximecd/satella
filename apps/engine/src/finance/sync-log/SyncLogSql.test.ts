import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

import { describe, expect, it } from "@effect/vitest";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { listSyncLog, recordSyncLog } from "./SyncLogSql.js";

describe("Sync log", () => {
  it.effect("lists newest entries with stable cursor pagination", () =>
    Effect.gen(function* () {
      const options = { now: () => new Date("2026-08-20T12:00:00.000Z") };
      yield* recordSyncLog(
        {
          completedAt: new Date("2026-08-20T10:00:00.000Z"),
          subjectKind: "asset",
          subjectName: "Older asset",
          action: "price_check",
          outcome: "success",
        },
        options,
      );
      yield* recordSyncLog(
        {
          completedAt: new Date("2026-08-20T11:00:00.000Z"),
          subjectKind: "custodian",
          subjectName: "Bank",
          action: "refresh",
          outcome: "failure",
          failureReason: "The Custodian could not be refreshed.",
        },
        options,
      );
      yield* recordSyncLog(
        {
          completedAt: new Date("2026-08-20T12:00:00.000Z"),
          subjectKind: "asset",
          subjectName: "Newest asset",
          action: "price_check",
          outcome: "success",
        },
        options,
      );

      const first = yield* listSyncLog({ limit: 2 });
      expect(first.entries.map(({ subjectName }) => subjectName)).toEqual(["Newest asset", "Bank"]);
      expect(first.nextCursor).not.toBeNull();

      const second = yield* listSyncLog({ cursor: first.nextCursor!, limit: 2 });
      expect(second.entries.map(({ subjectName }) => subjectName)).toEqual(["Older asset"]);
      expect(second.nextCursor).toBeNull();
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("retains the exact thirty-day boundary and removes older entries on write", () =>
    Effect.gen(function* () {
      yield* recordSyncLog(
        {
          completedAt: new Date("2026-01-01T00:00:00.000Z"),
          subjectKind: "asset",
          subjectName: "Expired",
          action: "price_check",
          outcome: "failure",
          failureReason: "No price was returned.",
        },
        { now: () => new Date("2026-01-01T00:00:00.000Z") },
      );
      yield* recordSyncLog(
        {
          completedAt: new Date("2026-01-02T00:00:00.000Z"),
          subjectKind: "asset",
          subjectName: "Boundary",
          action: "price_check",
          outcome: "success",
        },
        { now: () => new Date("2026-02-01T00:00:00.000Z") },
      );

      const page = yield* listSyncLog();
      expect(page.entries.map(({ subjectName }) => subjectName)).toEqual(["Boundary"]);
      const sql = yield* SqlClient.SqlClient;
      const snapshots = yield* sql<{
        readonly count: number;
      }>`SELECT count(*) AS count FROM snapshots`;
      expect(snapshots[0]?.count).toBe(0);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("allows a failure entry without a sanitized reason", () =>
    Effect.gen(function* () {
      yield* recordSyncLog({
        subjectKind: "asset",
        subjectName: "Unresolved asset",
        action: "price_check",
        outcome: "failure",
      });

      const page = yield* listSyncLog();
      expect(page.entries[0]?.failureReason).toBeNull();
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
