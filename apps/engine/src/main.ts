import { createServer } from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";
import * as Layer from "effect/Layer";
import * as References from "effect/References";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpRouter } from "effect/unstable/http";

import { ApiErrorLogging } from "./api/ApiLogging.js";
import { EngineApiLive } from "./api/FinanceApiLive.js";
import { VaultFinanceAccess } from "./api/VaultAccess.js";
import {
  appOrigin,
  isDevelopmentContext,
  isLiveSatella,
  openBrowser,
  parsePort,
  printStartupBanner,
  resolveWebDirectory,
  ServeUi,
  shouldOpenBrowser,
} from "./cli/product-runtime.js";
import { DatabaseConfig, DatabaseConfigLive } from "./database/index.js";
import {
  claimDatabaseOwnership,
  releaseDatabaseOwnership,
  releaseDatabaseOwnershipSync,
} from "./database/ownership.js";
import { IdGeneratorLive } from "./IdGenerator.js";
import { EngineServicesLive } from "./runtime/EngineComposition.js";
import { ManagedRuntime } from "./runtime/ManagedRuntime.js";

const enginePort = parsePort(process.env["SATELLA_ENGINE_PORT"], 3001);
const webOrigin = process.env["SATELLA_WEB_ORIGIN"];
const webDirectory = resolveWebDirectory();
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

const StartupUiLive = Layer.effectDiscard(
  Effect.sync(() => {
    if (isDevelopmentContext()) return;
    printStartupBanner(`${appOrigin(enginePort)}/`);
    if (shouldOpenBrowser()) openBrowser(`${appOrigin(enginePort)}/`);
  }),
);

const routesLayer = EngineApiLive.pipe(
  Layer.provideMerge(VaultFinanceAccess),
  Layer.provideMerge(ApiErrorLogging),
  Layer.provideMerge(ServeUi(webDirectory)),
  Layer.provideMerge(
    HttpRouter.cors({
      allowedOrigins: [
        ...(webOrigin === undefined ? [] : [webOrigin]),
        "http://127.0.0.1:5173",
        "http://localhost:5173",
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

const ServerLive = StartupUiLive.pipe(
  Layer.provide(HttpServerLive),
  Layer.provide(ManagedParentLifecycleLive),
  Layer.provide(EngineServicesLive),
  Layer.provide(OwnershipLive),
  Layer.provide(DatabaseConfigLive),
  Layer.provide(IdGeneratorLive),
);

const listenError = (cause: Cause.Cause<unknown>) => {
  const text = Cause.pretty(cause);
  if (text.includes("EADDRINUSE")) {
    return new Error(`127.0.0.1:${enginePort} is already in use by a process that is not Satella.`);
  }
  return undefined;
};

const launch = async () => {
  if (await isLiveSatella(enginePort)) {
    if (shouldOpenBrowser()) openBrowser(`${appOrigin(enginePort)}/`);
    process.exit(0);
  }

  const server = Layer.launch(ServerLive.pipe(Layer.provide(FetchHttpClient.layer))).pipe(
    Effect.catchCause((cause) => {
      const rewritten = listenError(cause);
      return rewritten === undefined ? Effect.failCause(cause) : Effect.fail(rewritten);
    }),
  );
  const quiet = isDevelopmentContext()
    ? server
    : server.pipe(
        Effect.provide(Logger.layer([Logger.consolePretty({ colors: "auto" })])),
        Effect.provideService(References.MinimumLogLevel, "Warn"),
      );
  quiet.pipe(NodeRuntime.runMain);
};

void launch();
