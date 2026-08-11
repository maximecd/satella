import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Database from "better-sqlite3";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";
import type { MigrationRegistry } from "@engine/database";

const run = (directory: string, migrations: MigrationRegistry) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.void.pipe(
        Effect.provide(
          makeDatabaseLive({ migrations }).pipe(
            Layer.provide(DatabaseConfigFromDirectory(directory)),
          ),
        ),
      ),
    ),
  );

describe("SQLite migration backups", () => {
  it("uses the online backup API before upgrading an existing database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-engine-backup-"));
    const first: MigrationRegistry = {
      "0001_create_values": Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`CREATE TABLE values_table (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`;
        yield* sql`INSERT INTO values_table (id, value) VALUES (1, 'before-upgrade')`;
      }),
    };
    const second: MigrationRegistry = {
      ...first,
      "0002_add_kind": Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`ALTER TABLE values_table ADD COLUMN kind TEXT NOT NULL DEFAULT 'cash'`;
      }),
    };

    try {
      await run(directory, first);
      await run(directory, second);

      const names = (await readdir(join(directory, "backups"))).filter((name) =>
        name.endsWith(".sqlite"),
      );
      expect(names).toHaveLength(1);
      expect(names[0]).toMatch(/^pre-migration-1-to-2-.+\.sqlite$/);

      const backup = new Database(join(directory, "backups", names[0]!));
      expect(backup.prepare("SELECT id, value FROM values_table").all()).toEqual([
        { id: 1, value: "before-upgrade" },
      ]);
      expect(backup.prepare("PRAGMA quick_check").get()).toEqual({ quick_check: "ok" });
      backup.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
