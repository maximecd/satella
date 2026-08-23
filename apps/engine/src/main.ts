import { createServer } from "node:http";
import { join } from "node:path";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpRouter } from "effect/unstable/http";

import { ApiErrorLogging } from "./api/ApiLogging.js";
import { EngineTokenAuth, EngineTokenFromSecret, ENGINE_TOKEN_ENV } from "./api/EngineToken.js";
import { EngineApiLive } from "./api/FinanceApiLive.js";
import { VaultFinanceAccess } from "./api/VaultAccess.js";
import { DatabaseConfig, DatabaseConfigLive } from "./database/index.js";
import {
  claimDatabaseOwnership,
  releaseDatabaseOwnership,
  releaseDatabaseOwnershipSync,
} from "./database/ownership.js";
import { FinanceLive } from "./finance/FinanceLive.js";
import { FailureLogDirectory, NodeFailureLogFilesLive } from "./finance/refresh/FailureLog.js";
import { layer as FailureLogLive } from "./finance/refresh/FailureLog.js";
import { layer as AutoRefreshLive } from "./finance/refresh/AutoRefresh.js";
import { IdGeneratorLive } from "./IdGenerator.js";
import { ManagedRuntime, layer as ManagedRuntimeLive } from "./runtime/ManagedRuntime.js";
import { layer as VaultEventsLive } from "./vault/VaultEvents.js";
import { VaultLive } from "./vault/VaultLive.js";

const parsePort = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : fallback;
};

const enginePort = parsePort(process.env["SATELLA_ENGINE_PORT"], 3001);
const webOrigin = process.env["SATELLA_WEB_ORIGIN"];
const parentDataDirectory =
  process.env["SATELLA_CANONICAL_DATA_DIR"] ?? process.env["SATELLA_DATA_DIR"];

process.on("exit", () => {
  if (parentDataDirectory !== undefined) {
    releaseDatabaseOwnershipSync(parentDataDirectory);
  }
});

const OwnershipLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* DatabaseConfig;
    yield* claimDatabaseOwnership(config.dataDirectory);
    yield* Effect.addFinalizer(() => releaseDatabaseOwnership(config.dataDirectory));
    const started = Effect.logInfo("Engine listening").pipe(
      Effect.annotateLogs("database_path", config.databasePath),
      Effect.annotateLogs("envelope_path", config.envelopePath),
    );
    yield* config.worktreeRoot === undefined
      ? started
      : started.pipe(Effect.annotateLogs("worktree_root", config.worktreeRoot));
  }),
).pipe(Layer.provide(DatabaseConfigLive));

const FailureLogDirectoryLive = Layer.effect(
  FailureLogDirectory,
  Effect.gen(function* () {
    const config = yield* DatabaseConfig;
    const override = process.env["SATELLA_LOG_DIR"];
    return {
      directory: override ?? join(config.dataDirectory, "logs"),
    };
  }),
).pipe(Layer.provide(DatabaseConfigLive));

const EngineFailureLogLive = FailureLogLive.pipe(
  Layer.provide(FailureLogDirectoryLive),
  Layer.provide(NodeFailureLogFilesLive),
);

const ManagedParentLifecycleLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const runtime = yield* ManagedRuntime;
    if (!runtime.managed) return;
    yield* Effect.forkScoped(
      runtime.awaitParentDisconnect().pipe(
        Effect.andThen(
          Effect.sync(() => {
            if (parentDataDirectory !== undefined) {
              releaseDatabaseOwnershipSync(parentDataDirectory);
            }
            process.exit(0);
          }),
        ),
      ),
    );
  }),
);

const routesLayer = EngineApiLive.pipe(
  Layer.provideMerge(VaultFinanceAccess),
  Layer.provideMerge(ApiErrorLogging),
  Layer.provideMerge(EngineTokenAuth),
  Layer.provideMerge(
    HttpRouter.cors({
      allowedOrigins: [
        ...(webOrigin === undefined ? [] : [webOrigin]),
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "null",
      ],
    }),
  ),
);

const HttpServerLive = HttpRouter.serve(routesLayer).pipe(
  Layer.provide(
    NodeHttpServer.layer(createServer, {
      host: "127.0.0.1",
      port: enginePort,
    }),
  ),
);

const ServerLive = HttpServerLive.pipe(
  Layer.provide(ManagedParentLifecycleLive),
  Layer.provide(ManagedRuntimeLive()),
  Layer.provide(AutoRefreshLive().pipe(Layer.provide(EngineFailureLogLive))),
  Layer.provide(FinanceLive),
  Layer.provide(VaultEventsLive),
  Layer.provide(VaultLive.pipe(Layer.provide(DatabaseConfigLive), Layer.provide(VaultEventsLive))),
  Layer.provide(OwnershipLive),
  Layer.provide(DatabaseConfigLive),
  Layer.provide(IdGeneratorLive),
  Layer.provide(EngineTokenFromSecret(process.env[ENGINE_TOKEN_ENV])),
);

Layer.launch(ServerLive.pipe(Layer.provide(FetchHttpClient.layer))).pipe(NodeRuntime.runMain);
