import { createServer } from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ApiErrorLogging } from "./api/ApiLogging.js";
import { EngineApiLive } from "./api/FinanceApiLive.js";
import { DatabaseLive, DatabaseReady } from "./database/index.js";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpRouter } from "effect/unstable/http";
import { FinanceLive } from "./finance/FinanceLive.js";
import { IdGeneratorLive } from "./IdGenerator.js";
import { PortfolioService } from "./finance/portfolio/PortfolioService.js";

const parsePort = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : fallback;
};

const enginePort = parsePort(process.env["OPTIMUS_ENGINE_PORT"], 3001);
const webOrigin = process.env["OPTIMUS_WEB_ORIGIN"];

const routesLayer = EngineApiLive.pipe(
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

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    yield* DatabaseReady;
    const portfolio = yield* PortfolioService;
    yield* portfolio
      .captureSnapshotIfDue()
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("Daily finance snapshot was not captured").pipe(
            Effect.annotateLogs("error", String(error)),
          ),
        ),
      );
    return HttpServerLive;
  }),
).pipe(Layer.provide(FinanceLive), Layer.provide(DatabaseLive), Layer.provide(IdGeneratorLive));

Layer.launch(ServerLive.pipe(Layer.provide(FetchHttpClient.layer))).pipe(NodeRuntime.runMain);
