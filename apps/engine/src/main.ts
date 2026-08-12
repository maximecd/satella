import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import * as HttpServer from "@effect/platform/HttpServer";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createServer } from "node:http";

import { EngineApi } from "./api.js";
import { ApiErrorLogging } from "./api-logging.js";
import { DatabaseLive, DatabaseReady } from "./database/index.js";
import * as FinanceService from "./finance/service.js";
import * as MarketData from "./finance/market-data.js";

const parsePort = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : fallback;
};

const enginePort = parsePort(process.env["OPTIMUS_ENGINE_PORT"], 3001);
const webOrigin = process.env["OPTIMUS_WEB_ORIGIN"];

const SystemApiLive = HttpApiBuilder.group(EngineApi, "system", (handlers) =>
  handlers.handle("hello", () => Effect.succeed({ message: "Hello world" })),
);

const FinanceApiLive = HttpApiBuilder.group(EngineApi, "finance", (handlers) =>
  handlers
    .handle("connectorCapabilities", () => Effect.succeed(FinanceService.connectorCapabilities()))
    .handle("listCustodians", () => FinanceService.listCustodians())
    .handle("getCustodian", ({ path }) => FinanceService.getCustodian(path.id))
    .handle("createCustodian", ({ payload }) => FinanceService.createCustodian(payload))
    .handle("connectCustodian", ({ payload }) => FinanceService.connectCustodian(payload))
    .handle("resyncCustodian", ({ path }) => FinanceService.resyncCustodian(path.id))
    .handle("updateCustodian", ({ path, payload }) =>
      FinanceService.updateCustodian(path.id, payload),
    )
    .handle("deleteCustodian", ({ path }) => FinanceService.deleteCustodian(path.id))
    .handle("getAccount", ({ path }) => FinanceService.getAccount(path.id))
    .handle("createAccount", ({ payload }) => FinanceService.createAccount(payload))
    .handle("updateAccount", ({ path, payload }) => FinanceService.updateAccount(path.id, payload))
    .handle("deleteAccount", ({ path }) => FinanceService.deleteAccount(path.id))
    .handle("searchAssets", ({ urlParams }) =>
      MarketData.searchAssets(urlParams.query, urlParams.assetClass),
    )
    .handle("listAssets", () => FinanceService.listAssets())
    .handle("getAsset", ({ path }) => FinanceService.getAsset(path.id))
    .handle("createAsset", ({ payload }) => FinanceService.createAsset(payload))
    .handle("updateAsset", ({ path, payload }) =>
      FinanceService.updateCustomAsset(path.id, payload),
    )
    .handle("setManualPrice", ({ path, payload }) =>
      FinanceService.setManualPrice(path.id, payload),
    )
    .handle("deleteAsset", ({ path }) => FinanceService.deleteAsset(path.id))
    .handle("getPositionAccount", ({ path }) => FinanceService.getPositionAccount(path.id))
    .handle("createPosition", ({ payload }) => FinanceService.createPosition(payload))
    .handle("updatePosition", ({ path, payload }) =>
      FinanceService.updatePosition(path.id, payload.quantity),
    )
    .handle("deletePosition", ({ path }) => FinanceService.deletePosition(path.id))
    .handle("portfolioHistory", () => FinanceService.getPortfolioHistory())
    .handle("refreshPrices", () => MarketData.refreshPrices({ requireFresh: true }))
    .handle("captureSnapshot", () => FinanceService.captureSnapshot()),
);

const EngineApiLive = HttpApiBuilder.api(EngineApi).pipe(
  Layer.provide(SystemApiLive),
  Layer.provide(FinanceApiLive),
);

const HttpServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiErrorLogging),
  Layer.provide(
    HttpApiBuilder.middlewareCors({
      allowedOrigins: [
        ...(webOrigin === undefined ? [] : [webOrigin]),
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "null",
      ],
    }),
  ),
  Layer.provide(EngineApiLive),
  HttpServer.withLogAddress,
  Layer.provide(
    NodeHttpServer.layer(createServer, {
      host: "127.0.0.1",
      port: enginePort,
    }),
  ),
);

const ServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    yield* DatabaseReady;
    yield* FinanceService.captureSnapshotIfDue().pipe(
      Effect.catchAll((error) =>
        Effect.logWarning("Daily finance snapshot was not captured").pipe(
          Effect.annotateLogs("error", error.message),
        ),
      ),
    );
    return HttpServerLive;
  }),
).pipe(Layer.provide(DatabaseLive));
const ServerWithConnectorDependencies = ServerLive.pipe(Layer.provide(FetchHttpClient.layer));
Layer.launch(ServerWithConnectorDependencies).pipe(NodeRuntime.runMain);
