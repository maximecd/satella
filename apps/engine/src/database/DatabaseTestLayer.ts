import { randomBytes } from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DatabaseConfigFromDirectory,
  DatabaseKey,
  makeDatabaseLive,
  type DatabaseLiveOptions,
} from "./index.js";

export class TempDirectoryError extends Data.TaggedError("TempDirectoryError")<{
  readonly cause: unknown;
}> {}

export const acquireTestDirectory = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), "optimus-engine-")),
    catch: (cause) => new TempDirectoryError({ cause }),
  }),
  (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
);

const testDek = () => DatabaseKey.of({ dek: randomBytes(32) });

/** Fresh temporary encrypted SQLite database per scope. Closes the client and deletes the directory. */
export const DatabaseTestLayer = (options: DatabaseLiveOptions = {}) =>
  Layer.unwrap(
    acquireTestDirectory.pipe(
      Effect.map((directory) =>
        makeDatabaseLive(options).pipe(
          Layer.provide(DatabaseConfigFromDirectory(directory)),
          Layer.provide(Layer.succeed(DatabaseKey, testDek())),
        ),
      ),
    ),
  );
