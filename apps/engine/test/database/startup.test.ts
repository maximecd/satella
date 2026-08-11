import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "../../src/database/index.js";

describe("SQLite lifecycle", () => {
  it("closes the scoped connection so its temporary directory can be removed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-engine-lifecycle-"));

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            yield* sql`SELECT 1`;
          }).pipe(
            Effect.provide(
              makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
            ),
          ),
        ),
      );

      await rm(directory, { recursive: true, force: false });
      await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
