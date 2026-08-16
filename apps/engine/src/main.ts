import { createServer } from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpRouter } from "effect/unstable/http";

import { ApiErrorLogging } from "./api/ApiLogging.js";
import { EngineApiLive } from "./api/FinanceApiLive.js";
import { VaultFinanceAccess } from "./api/VaultAccess.js";
import {
  DatabaseConfig,
  DatabaseConfigLive,
} from "./database/index.js";
import { claimDatabaseOwnership, releaseDatabaseOwnership } from "./database/ownership.js";
import { FinanceLive } from "./finance/FinanceLive.js";
import { IdGeneratorLive } from "./IdGenerator.js";
import { VaultLive } from "./vault/VaultLive.js";

const parsePort = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : fallback;
};

const enginePort = parsePort(process.env["OPTIMUS_ENGINE_PORT"], 3001);
const webOrigin = process.env["OPTIMUS_WEB_ORIGIN"];

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

const routesLayer = EngineApiLive.pipe(
  Layer.provideMerge(VaultFinanceAccess),
  Layer.provideMerge(ApiErrorLogging),
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
  Layer.provide(FinanceLive),
  Layer.provide(VaultLive),
  Layer.provide(OwnershipLive),
  Layer.provide(DatabaseConfigLive),
  Layer.provide(IdGeneratorLive),
);

Layer.launch(ServerLive.pipe(Layer.provide(FetchHttpClient.layer))).pipe(NodeRuntime.runMain);
