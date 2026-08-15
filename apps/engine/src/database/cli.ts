import * as Effect from "effect/Effect";

import {
  DATABASE_CONTEXT_ENV,
  DEVELOPMENT_DATABASE_CONTEXT,
  resolveDatabaseLocation,
  type DatabaseLocation,
} from "./config.js";
import { resetDatabase, seedDatabase } from "./tooling.js";

const printLocation = (location: DatabaseLocation) => {
  if (location.worktreeRoot !== undefined) {
    console.log(`Worktree: ${location.worktreeRoot}`);
  }
  console.log(`Database: ${location.databasePath}`);
};

const errorMessage = (error: unknown) => {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(error);
};

const args = process.argv.slice(2);
const reset = args.includes("reset");
const seed = args.includes("seed") || args.includes("--seed");

if (!reset && !seed) {
  console.error("Usage: db:reset, db:seed, or db:reset --seed");
  process.exitCode = 1;
} else {
  const program = Effect.gen(function* () {
    if (process.env[DATABASE_CONTEXT_ENV] === undefined) {
      process.env[DATABASE_CONTEXT_ENV] = DEVELOPMENT_DATABASE_CONTEXT;
    }
    const location = yield* resolveDatabaseLocation();
    printLocation(location);
    if (reset) {
      yield* resetDatabase(location);
      console.log("Reset complete.");
    }
    if (seed) {
      yield* seedDatabase(location);
      console.log("Seed complete.");
    }
  });

  program.pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          console.error(errorMessage(error));
          process.exitCode = 1;
        }),
      onSuccess: () => Effect.void,
    }),
    Effect.runPromise,
  );
}
