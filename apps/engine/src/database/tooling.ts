import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { rm } from "node:fs/promises";
import { SqlClient } from "effect/unstable/sql";

import { DatabaseConfigFromDirectory, makeDatabaseLive, DatabaseReady } from "./index.js";
import { DatabaseConfigError } from "./errors.js";
import { assertDatabaseUnlocked } from "./ownership.js";
import { seedDevelopmentFixture } from "./seed.js";
import type { DatabaseLocation } from "./config.js";

const removeDataDirectory = (dataDirectory: string) =>
  Effect.tryPromise({
    try: () => rm(dataDirectory, { recursive: true, force: true }),
    catch: (cause) =>
      new DatabaseConfigError({
        reason: "filesystem",
        path: dataDirectory,
        cause,
        message: `Could not remove the Optimus data directory: ${dataDirectory}`,
      }),
  });

const withMigratedDatabase = <A, E>(
  dataDirectory: string,
  program: Effect.Effect<A, E, SqlClient.SqlClient | DatabaseReady>,
) =>
  Effect.scoped(
    program.pipe(
      Effect.provide(
        makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(dataDirectory))),
      ),
    ),
  );

export const resetDatabase = (location: DatabaseLocation) =>
  Effect.gen(function* () {
    yield* assertDatabaseUnlocked(location.dataDirectory, location.databasePath);
    yield* removeDataDirectory(location.dataDirectory);
    yield* withMigratedDatabase(location.dataDirectory, DatabaseReady);
  });

export const seedDatabase = (location: DatabaseLocation) =>
  Effect.gen(function* () {
    yield* assertDatabaseUnlocked(location.dataDirectory, location.databasePath);
    yield* withMigratedDatabase(
      location.dataDirectory,
      Effect.gen(function* () {
        yield* DatabaseReady;
        yield* seedDevelopmentFixture;
      }),
    );
  });
