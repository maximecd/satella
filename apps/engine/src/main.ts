import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import * as HttpServer from "@effect/platform/HttpServer";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createServer } from "node:http";

import { EngineApi } from "./api.js";
import { DatabaseLive, DatabaseReady } from "./database/index.js";

const SystemApiLive = HttpApiBuilder.group(EngineApi, "system", (handlers) =>
  handlers.handle("hello", () => Effect.succeed({ message: "Hello world" })),
);

const EngineApiLive = HttpApiBuilder.api(EngineApi).pipe(Layer.provide(SystemApiLive));

const HttpServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(
    HttpApiBuilder.middlewareCors({
      allowedOrigins: ["http://127.0.0.1:5173", "null"],
    }),
  ),
  Layer.provide(EngineApiLive),
  HttpServer.withLogAddress,
  Layer.provide(
    NodeHttpServer.layer(createServer, {
      host: "127.0.0.1",
      port: 3001,
    }),
  ),
);

const ServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    yield* DatabaseReady;
    return HttpServerLive;
  }),
).pipe(Layer.provide(DatabaseLive));
Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
