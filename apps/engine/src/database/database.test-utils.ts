import { randomBytes } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { FetchHttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import { DatabaseConfigFromDirectory, DatabaseKey, makeDatabaseLive } from "./index.js";
import type { MigrationRegistry } from "./index.js";
import { DatabaseTestLayer } from "./DatabaseTestLayer.js";

export { acquireTestDirectory } from "./DatabaseTestLayer.js";

const directoryKeys = new Map<string, Uint8Array>();

export const dekForDirectory = (directory: string) => {
  const existing = directoryKeys.get(directory);
  if (existing !== undefined) return existing;
  const dek = randomBytes(32);
  directoryKeys.set(directory, dek);
  return dek;
};

export const encryptedDatabaseLayer = (
  directory: string,
  options: Parameters<typeof makeDatabaseLive>[0] = {},
) =>
  makeDatabaseLive(options).pipe(
    Layer.provide(DatabaseConfigFromDirectory(directory)),
    Layer.provide(Layer.succeed(DatabaseKey, DatabaseKey.of({ dek: dekForDirectory(directory) }))),
  );

/** Fresh temporary SQLite plus HTTP client. Call once per test so scopes do not share state. */
export const engineTestLayer = () =>
  DatabaseTestLayer().pipe(Layer.provideMerge(FetchHttpClient.layer));

export const scopedCustomMigrations = <A, E>(
  directory: string,
  migrations: MigrationRegistry,
  program: Effect.Effect<A, E, SqlClient.SqlClient>,
) => Effect.scoped(program.pipe(Effect.provide(encryptedDatabaseLayer(directory, { migrations }))));
