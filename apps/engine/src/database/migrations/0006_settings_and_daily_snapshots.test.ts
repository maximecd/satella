import * as Effect from "effect/Effect";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import { engineTestLayer } from "../database.test-utils.js";

describe("application settings and daily snapshots", () => {
  it.effect("defaults Reporting currency to USD and keeps one snapshot per calendar day", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const settings = yield* sql<{
        readonly reporting_currency_asset_id: string;
      }>`SELECT reporting_currency_asset_id FROM app_settings WHERE id = 1`;
      const indexes = yield* sql<{ readonly name: string }>`PRAGMA index_list(snapshots)`;

      yield* sql`INSERT INTO snapshots (id, captured_at)
        VALUES ('s1', '2026-08-11T08:00:00.000Z')`;
      const sameDay = yield* sql`INSERT INTO snapshots (id, captured_at)
        VALUES ('s2', '2026-08-11T18:00:00.000Z')`.pipe(Effect.flip);
      yield* sql`INSERT INTO snapshots (id, captured_at)
        VALUES ('s3', '2026-08-12T08:00:00.000Z')`;
      const days = yield* sql<{ readonly captured_at: string }>`
        SELECT captured_at FROM snapshots ORDER BY captured_at`;

      expect(settings).toEqual([{ reporting_currency_asset_id: "fiat:USD" }]);
      expect(indexes.map(({ name }) => name)).toContain("snapshots_one_per_calendar_day");
      expect(sameDay).toBeDefined();
      expect(days.map(({ captured_at }) => captured_at)).toEqual([
        "2026-08-11T08:00:00.000Z",
        "2026-08-12T08:00:00.000Z",
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
