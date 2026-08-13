import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { FetchHttpClient } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import { DatabaseConfigFromDirectory, makeDatabaseLive } from "./index.js";
import type { MigrationRegistry } from "./index.js";
import { DatabaseTestLayer } from "./DatabaseTestLayer.js";

export { acquireTestDirectory } from "./DatabaseTestLayer.js";

/** Fresh temporary SQLite plus HTTP client. Call once per test so scopes do not share state. */
export const engineTestLayer = () =>
  DatabaseTestLayer().pipe(Layer.provideMerge(FetchHttpClient.layer));

export const scopedCustomMigrations = <A, E>(
  directory: string,
  migrations: MigrationRegistry,
  program: Effect.Effect<A, E, SqlClient.SqlClient>,
) =>
  Effect.scoped(
    program.pipe(
      Effect.provide(
        makeDatabaseLive({ migrations }).pipe(
          Layer.provide(DatabaseConfigFromDirectory(directory)),
        ),
      ),
    ),
  );
