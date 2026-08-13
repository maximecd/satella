import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { SqlClient } from "effect/unstable/sql";
import { DatabaseConfigFromDirectory, makeDatabaseLive } from "./index.js";
import { TempDirectoryError } from "./DatabaseTestLayer.js";

describe("SQLite lifecycle", () => {
  it.effect("closes the scoped connection so its temporary directory can be removed", () =>
    Effect.gen(function* () {
      const directory = yield* Effect.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "optimus-engine-lifecycle-")),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => rm(directory, { recursive: true, force: true })),
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`SELECT 1`;
        }).pipe(
          Effect.provide(
            makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
          ),
        ),
      );
      yield* Effect.tryPromise({
        try: () => rm(directory, { recursive: true, force: false }),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      const missing = yield* Effect.tryPromise({
        try: async () => {
          try {
            await stat(directory);
            return false;
          } catch (error) {
            return (error as NodeJS.ErrnoException).code === "ENOENT";
          }
        },
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      expect(missing).toBe(true);
    }),
  );
});
