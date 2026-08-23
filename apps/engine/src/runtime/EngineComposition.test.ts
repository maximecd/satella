import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FetchHttpClient } from "effect/unstable/http";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vite-plus/test";

import { DatabaseConfigFromDirectory } from "../database/index.js";
import { FAST_KDF } from "../vault/kdf.js";
import { VaultService } from "../vault/Vault.js";
import { makeEngineServicesLive } from "./EngineComposition.js";

describe("engine composition", () => {
  it("starts the automatic cycle from the shared Vault unlock signal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-engine-composition-"));
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const vault = yield* VaultService;
            yield* vault.initialize({
              password: "correct-horse-battery",
              pin: "2468",
              kdf: FAST_KDF,
            });
            const sql = yield* vault.currentSql();
            for (let attempt = 0; attempt < 200; attempt += 1) {
              const rows = yield* sql<{
                readonly count: number;
              }>`SELECT count(*) AS count FROM snapshots`;
              if ((rows[0]?.count ?? 0) > 0) return;
              yield* Effect.sleep("10 millis");
            }
            expect.fail("The automatic cycle did not capture its immediate Snapshot");
          }).pipe(
            Effect.provide(
              makeEngineServicesLive(DatabaseConfigFromDirectory(directory)).pipe(
                Layer.provide(FetchHttpClient.layer),
              ),
            ),
          ),
        ),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
