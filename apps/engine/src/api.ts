import * as HttpApi from "@effect/platform/HttpApi";
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint";
import * as HttpApiGroup from "@effect/platform/HttpApiGroup";
import * as Schema from "effect/Schema";

export const HelloResponse = Schema.Struct({
  message: Schema.String,
});

const SystemApi = HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("hello")`/api/hello`.addSuccess(HelloResponse),
);

export const EngineApi = HttpApi.make("engine").add(SystemApi);
