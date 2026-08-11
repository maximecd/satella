import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpApiClient from "@effect/platform/HttpApiClient";
import { EngineApi } from "@optimus/engine/api";
import * as Effect from "effect/Effect";

const engineUrl = import.meta.env["VITE_ENGINE_URL"] ?? "http://127.0.0.1:3001";

const hello = HttpApiClient.make(EngineApi, { baseUrl: engineUrl }).pipe(
  Effect.flatMap((client) => client.system.hello({})),
  Effect.provide(FetchHttpClient.layer),
);

export const getHello = () => Effect.runPromise(hello);
