import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { randomUUID } from "node:crypto";

export class IdGenerator extends Context.Service<
  IdGenerator,
  {
    readonly uuid: Effect.Effect<string>;
  }
>()("@optimus/engine/IdGenerator") {}

export const IdGeneratorLive = Layer.succeed(
  IdGenerator,
  IdGenerator.of({
    uuid: Effect.sync(() => randomUUID()),
  }),
);
