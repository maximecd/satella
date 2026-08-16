import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { rm } from "node:fs/promises";
import { SqlClient } from "effect/unstable/sql";

import { DatabaseConfigFromDirectory } from "./index.js";
import { DatabaseConfigError } from "./errors.js";
import { assertDatabaseUnlocked } from "./ownership.js";
import { seedDevelopmentFixture } from "./seed.js";
import type { DatabaseLocation } from "./config.js";
import { FAST_KDF, PRODUCTION_KDF } from "../vault/kdf.js";
import {
  DEVELOPMENT_SCREEN_LOCK_PIN,
  DEVELOPMENT_VAULT_PASSWORD,
  VaultLive,
} from "../vault/VaultLive.js";
import { VaultService } from "../vault/Vault.js";

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

const kdf = () => (process.env["OPTIMUS_VAULT_KDF"] === "fast" ? FAST_KDF : PRODUCTION_KDF);

const withVault = <A, E>(
  dataDirectory: string,
  program: Effect.Effect<A, E, VaultService | SqlClient.SqlClient>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const vault = yield* VaultService;
      const status = yield* vault.status();
      if (status.state === "absent") {
        yield* vault.initialize({
          password: DEVELOPMENT_VAULT_PASSWORD,
          pin: DEVELOPMENT_SCREEN_LOCK_PIN,
          kdf: kdf(),
        });
      } else if (status.state === "locked") {
        yield* vault.unlock(DEVELOPMENT_VAULT_PASSWORD);
      }
      const sql = yield* vault.currentSql();
      return yield* program.pipe(Effect.provideService(SqlClient.SqlClient, sql));
    }).pipe(Effect.provide(VaultLive.pipe(Layer.provide(DatabaseConfigFromDirectory(dataDirectory))))),
  );

export const resetDatabase = (location: DatabaseLocation) =>
  Effect.gen(function* () {
    yield* assertDatabaseUnlocked(location.dataDirectory, location.databasePath);
    yield* removeDataDirectory(location.dataDirectory);
  });

export const seedDatabase = (location: DatabaseLocation) =>
  Effect.gen(function* () {
    yield* assertDatabaseUnlocked(location.dataDirectory, location.databasePath);
    yield* withVault(location.dataDirectory, seedDevelopmentFixture);
  });
