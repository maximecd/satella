import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";

describe("default currencies", () => {
  it("seeds the ten supported fiat currencies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-default-currencies-"));
    try {
      const currencies = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            return yield* sql<{ readonly symbol: string }>`SELECT symbol FROM assets
              WHERE asset_class = 'fiat' ORDER BY symbol`;
          }).pipe(
            Effect.provide(
              makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
            ),
          ),
        ),
      );

      expect(currencies.map(({ symbol }) => symbol)).toEqual([
        "AUD",
        "CAD",
        "CHF",
        "CNH",
        "EUR",
        "GBP",
        "HKD",
        "JPY",
        "NZD",
        "USD",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
