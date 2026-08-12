# SQLite Persistence Plan

## Goal

Add a durable, local SQLite database to the standalone Effect engine, with startup migrations, schema/history validation, and recoverable upgrades that preserve existing data.

SQLite belongs in `apps/engine`. The web renderer and Electron shell must never open the database directly. This keeps one owner for persistence in both supported modes:

- embedded mode: Electron starts the engine and gives it a stable data directory;
- external mode: the user starts the same engine and configures that directory directly.

This plan establishes the persistence infrastructure. It deliberately does not invent finance-domain tables before their models are designed.

## Recommended Integration

Use the official Effect SQL packages:

- `@effect/sql` for the `SqlClient` service, tagged-template queries, transactions, `SqlSchema`, and the migration core;
- `@effect/sql-sqlite-node` for the Node SQLite implementation backed by `better-sqlite3`;
- `@effect/experimental`, required by the current stable SQLite client for its reactivity service.

Versions compatible with the repository's current `effect@3.22.1` and `@effect/platform@0.97.1` are:

```json
{
  "@effect/experimental": "0.61.0",
  "@effect/sql": "0.52.0",
  "@effect/sql-sqlite-node": "0.53.0"
}
```

Pin these in `apps/engine/package.json`, as the rest of the workspace does. Allow the transitive `better-sqlite3` install/build script in `pnpm-workspace.yaml`; it is a native dependency. Keep the engine on a supported Node LTS runtime and exercise the native module in packaged-build smoke tests.

Do not add Drizzle, Kysely, Prisma, or a custom `node:sqlite` wrapper initially. The official driver already participates directly in the Effect service/layer graph, scopes and closes its connection, serializes access, supports Effect transactions, enables WAL by default, and exposes a consistent SQLite backup operation. A query builder can be added later if real query complexity justifies another abstraction.

## Target Shape

```text
apps/engine/
  src/
    database/
      config.ts              Resolves and validates stable data paths
      client.ts              SQLite client and connection initialization
      migrations.ts          Static registry, history checks, backup, runner
      migrations/            Append-only numbered production migrations
      index.ts               Engine-internal database layer exports
    main.ts                  Provides DatabaseLive before starting HTTP
  test/
    database/
      startup.test.ts
      migrations.test.ts
      backup.test.ts
```

Do not export database modules through `@optimus/engine/api`; that entry point must remain browser-safe.

## Data Location and Ownership

Introduce one engine setting, `OPTIMUS_DATA_DIR`, representing a directory rather than a database filename. Derive these paths below it:

```text
<data-dir>/optimus.sqlite
<data-dir>/backups/
```

Rules:

1. Accept an absolute `OPTIMUS_DATA_DIR` override for services, containers, development, and tests.
2. When no override is supplied, resolve an OS-appropriate per-user application-data directory in the engine. Never default into `src`, `dist`, an ASAR archive, or the repository.
3. Resolve the path once at startup, make it absolute, create it recursively, and log the resolved database path without logging database contents.
4. In embedded mode, the future Electron child-process launcher should pass an explicit absolute directory derived from `app.getPath("userData")`, for example `<userData>/engine`. The engine must not import Electron to discover this.
5. Tests must inject a fresh temporary directory; they must never use the developer's real database.
6. Only one engine instance owns a given data directory. Neither the desktop main process nor the renderer may create a second SQLite connection.

Apply restrictive directory/file permissions where the host OS supports them, and treat migration backups as equally sensitive as the live database.

## Effect Layer Design

Build one scoped `DatabaseLive` layer and provide it to the engine application layer.

Its acquisition order must be explicit:

```text
resolve config
  -> create data and backup directories
  -> note whether the database existed before opening it
  -> acquire SqliteClient
  -> configure and verify connection pragmas
  -> validate migration history
  -> create a pre-migration backup when an existing DB has pending migrations
  -> run pending migrations
  -> validate the upgraded DB
  -> expose SqlClient/repositories
  -> acquire and serve the HTTP layer
```

The HTTP server must not bind its port until database initialization has completed. A configuration, open, backup, migration, or validation failure is a startup failure with a typed/logged cause; the engine must never serve against a partly upgraded or unknown schema.

`SqliteClient.layer` should receive the resolved `optimus.sqlite` filename. Keep its default WAL behavior and run these connection-level settings before migrations:

```sql
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
```

Read each pragma back and fail startup if the required setting was not accepted. Foreign-key enforcement is connection-local and SQLite does not guarantee it is enabled by default. Prefer durability over changing `synchronous` to `NORMAL` for speculative performance gains.

Keep the same scoped client layer instance shared by migration startup and all repositories. Do not call `Effect.runPromise` inside database modules; compose effects and layers until the single `NodeRuntime.runMain` boundary in `main.ts`.

## Migration Design

### Registry and packaging

Use append-only TypeScript migration modules with monotonically increasing numeric IDs:

```text
src/database/migrations/0001_create_accounts.ts
src/database/migrations/0002_add_account_currency.ts
```

Each module exports an Effect requiring `SqlClient`. Import every migration statically into `migrations.ts` and construct an explicit `Migrator.fromRecord` registry keyed as `0001_create_accounts`, etc.

Choose a static registry instead of:

- `import.meta.glob`, which is Vite-specific and is not transformed by the engine's `tsc` build;
- runtime filesystem discovery, which is easy to break when TypeScript files become JavaScript or when Electron packaging moves assets;
- ad hoc SQL files copied beside `dist`.

Do not configure the SQLite migrator's optional `schemaDirectory` dump in the runtime. That path invokes the external `sqlite3` command, which cannot be assumed to exist on a packaged desktop or server. If schema snapshots become useful, generate them in a development-only script or test.

Start with an empty production migration registry if no domain schema has been approved. The Effect migrator will still establish its migration ledger. Do not create a generic key/value or placeholder table merely to prove that SQLite opened; integration tests prove the infrastructure. The first real persisted feature owns migration `0001`.

### History safety

Use the Effect migration table (default `effect_sql_migrations`) as the authoritative ledger, but add a preflight check around the migrator:

1. Load the ordered in-code registry.
2. If the ledger exists, read all applied `(migration_id, name)` rows in ascending order.
3. Require the applied rows to be an exact prefix of the in-code registry.
4. Reject duplicate IDs, renamed/removed historical migrations, a database newer than the running binary, and a newly inserted migration whose ID sorts before an already-applied migration.
5. Only the remaining suffix is pending.

This extra check is important because the current Effect migrator decides what is pending from the latest applied numeric ID; on its own it does not make an old edited/removed migration safe. Once released, never edit, rename, reorder, or delete a migration. Fix mistakes with a new forward migration.

### Atomicity and failure behavior

Run the pending migrations through Effect's migrator. It records and executes the pending set inside the same `SqlClient.withTransaction`, so a failed migration rolls back its schema/data changes and its ledger entries together.

Use forward-only migrations. There is no automatic down migration and the engine must refuse to open a database created by a newer schema. Downgrading requires restoring a compatible backup together with the older application version.

For schema changes:

- use direct `ALTER TABLE` only for operations SQLite supports safely;
- for a table rebuild, create the replacement table first, copy and transform every row explicitly, recreate indexes/triggers, validate row counts and constraints, then drop the old table and rename the replacement;
- never implement a destructive change as “drop old table, then recreate it”;
- use an expand/backfill/contract sequence when a new required column or representation cannot be populated in one safe statement;
- never toggle `PRAGMA foreign_keys` inside a migration because that pragma is a no-op inside a transaction. For a rebuild that needs deferred checks, use `PRAGMA defer_foreign_keys = ON`, run `PRAGMA foreign_key_check` before completion, and let the outer migration transaction commit only when valid.

Data transformations belong in the migration and must be deterministic and restart-safe through transaction rollback. Avoid calling APIs, reading mutable external files, or depending on the current locale/time zone from a migration.

## Pre-Migration Backups

Before applying a non-empty pending set to a database that existed before startup:

1. Run `PRAGMA quick_check` and stop if the source database is already unhealthy.
2. Create `<data-dir>/backups/pre-migration-<from>-to-<to>-<UTC>.sqlite` using `SqliteClient.backup`, which delegates to SQLite's online backup mechanism. Do not copy only `optimus.sqlite` with filesystem APIs because WAL state may contain committed data.
3. Ensure the backup completed before starting the migration transaction.
4. After migrations, require `PRAGMA quick_check` to return `ok` and `PRAGMA foreign_key_check` to return no rows.
5. Only after successful validation, prune older automatic pre-migration backups to a small documented retention count (for example, the latest five). Never delete the just-created backup during the same startup.

A failed migration is not auto-restored: the transaction should already roll back, and automatically replacing the live file can make diagnosis worse. Fail startup, preserve the backup, and log its path plus recovery instructions. Add a separately designed restore command/workflow only when the product has a safe user-facing way to confirm it.

Do not create a backup for a brand-new database or when no migration is pending.

## Query and Repository Conventions

Keep SQL inside engine-owned repositories or persistence services, not HTTP handlers and not connector implementations.

- Depend on `SqlClient` through Effect context.
- Use parameterized `sql` tagged templates; use identifiers/literals only through the client's explicit helpers.
- Decode query results at the persistence boundary with Effect Schema and `SqlSchema.findAll`, `findOne`, `single`, or `void` as appropriate.
- Use `SqlClient.withTransaction` around domain operations that must update multiple tables atomically.
- Map `SqlError` and schema parse errors into operation-specific domain errors before they reach the HTTP API.
- Keep persistence row schemas separate from public API schemas when their representations differ.
- Test repositories against real temporary SQLite databases, not a mock query client.

Do not adopt `Model.makeRepository` as a blanket abstraction. It is fine for simple CRUD when a real model calls for it, but domain-specific repositories should own invariants and transaction boundaries rather than leaking a generic CRUD surface.

## Implementation Steps

### 1. Add dependencies and runtime guardrails

- Add the three pinned Effect SQL packages to `apps/engine/package.json`.
- Add compatible `vitest` and `@effect/vitest` versions to the engine's development dependencies and an engine `test` script.
- Add `better-sqlite3: true` to `allowBuilds` in `pnpm-workspace.yaml` and regenerate `pnpm-lock.yaml` through pnpm.
- Document/pin a supported Node LTS range for development and the standalone engine runtime. Verify a clean install loads the native module rather than relying on a developer's existing `node_modules`.

### 2. Add database configuration

- Implement `database/config.ts` as an injectable Effect service/layer.
- Resolve the data directory and derived database/backup paths.
- Validate overrides and create directories before opening SQLite.
- Record whether `optimus.sqlite` existed before client acquisition; use that fact when deciding whether to back up.
- Add any development-only local data path to `.gitignore` if the chosen development workflow creates one inside the repository.

### 3. Add and initialize the client

- Implement the shared scoped `SqliteClient.layer` in `database/client.ts`.
- Apply and verify the pragmas listed above.
- Expose `SqlClient` to repositories and the SQLite-specific client only to infrastructure that needs backup/export features.
- Add structured startup logs for database open/close and schema version without logging SQL parameters containing user data.

### 4. Implement the migration runner

- Add the explicit static registry and history-prefix validation.
- Add preflight health checking and pending-version calculation.
- Add the consistent pre-migration backup and post-migration validation flow.
- Invoke the official Effect migrator for the transactional migration itself.
- Keep the production registry empty until the first approved domain schema, rather than adding a placeholder table.

### 5. Wire startup ordering

- Compose `DatabaseLive` into `main.ts` so it is acquired before `HttpApiBuilder.serve` can listen.
- Ensure the same database layer instance is shared rather than opening a client for migration and another for requests.
- Let defects/unexpected migration failures terminate through `NodeRuntime.runMain` with useful annotations.
- Keep `api.ts` and the web package free of all SQL/native imports.

### 6. Add integration tests

Cover at least:

1. first startup creates the database and migration ledger in a temporary directory;
2. migrations run in numeric order and run only once across restart;
3. a fixture row survives an additive migration and a table-rebuild migration;
4. a failing migration rolls back both changed data/schema and its ledger row;
5. edited, removed, duplicate, out-of-order, and newer-than-binary histories are rejected;
6. a pending migration on an existing database creates a readable, consistent backup containing the old schema and data;
7. a fresh database and a restart with no pending migration do not create backups;
8. foreign keys are enforced and post-migration quick/foreign-key checks pass;
9. the database connection closes when the Effect scope ends, allowing the temporary directory to be removed;
10. `pnpm --filter @optimus/engine build` produces runnable JavaScript with every statically registered migration included.

Use file-backed temporary databases for migration/backup tests. `:memory:` is acceptable only for small query tests because it cannot prove filesystem lifecycle, restart behavior, WAL handling, or backup retention.

### 7. Verify the repository and packaged boundary

Run:

```text
pnpm --filter @optimus/engine test
pnpm --filter @optimus/engine typecheck
pnpm --filter @optimus/engine build
pnpm check
```

Also run the built engine twice against the same temporary data directory, with an upgrade between runs, and verify the original fixture data remains. When Electron child-process packaging is implemented, add a packaged smoke test that starts the bundled standalone engine and loads `better-sqlite3` successfully on every target OS/architecture.

## Acceptance Criteria

- The engine is the only process/module that knows the SQLite path.
- The database lives in a stable writable data directory and survives engine/application upgrades.
- HTTP never starts before database initialization and migrations succeed.
- Released migrations are append-only, statically packaged, transactional, and tracked.
- Incompatible migration history or application downgrade fails closed instead of silently opening the database.
- An existing database receives a consistent backup before any pending migration.
- Migration failure preserves the pre-start data and prevents the engine from serving.
- Query results are schema-decoded at the persistence boundary.
- Tests prove data survival, rollback, backup, restart, and compiled-build behavior.
- The browser-safe API entry point does not acquire Node or database dependencies.

## Security Boundary

The standard `better-sqlite3` database and its backups are plaintext at rest. This plan does not resolve the encryption decision already deferred by the initial architecture plan.

It is safe to land the database/migration infrastructure now, but do not persist credentials, access tokens, account details, balances, transactions, or positions until the vault and at-rest encryption design is explicitly chosen. That later decision must cover the live database, migration backups, exports, key storage and rotation, and recovery—not only connector secrets.

## Primary References

- [Effect SQLite client source at `@effect/sql-sqlite-node@0.53.0`](https://github.com/Effect-TS/effect/blob/%40effect/sql-sqlite-node%400.53.0/packages/sql-sqlite-node/src/SqliteClient.ts)
- [Effect SQLite migrator source at `@effect/sql-sqlite-node@0.53.0`](https://github.com/Effect-TS/effect/blob/%40effect/sql-sqlite-node%400.53.0/packages/sql-sqlite-node/src/SqliteMigrator.ts)
- [Effect migration core at `@effect/sql@0.52.0`](https://github.com/Effect-TS/effect/blob/%40effect/sql%400.52.0/packages/sql/src/Migrator.ts)
- [Effect SQL schema helpers at `@effect/sql@0.52.0`](https://github.com/Effect-TS/effect/blob/%40effect/sql%400.52.0/packages/sql/src/SqlSchema.ts)
- [SQLite ALTER TABLE and safe table-rebuild procedure](https://sqlite.org/lang_altertable.html)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [SQLite WAL documentation](https://www.sqlite.org/wal.html)
- [SQLite pragma documentation](https://www.sqlite.org/pragma.html)
