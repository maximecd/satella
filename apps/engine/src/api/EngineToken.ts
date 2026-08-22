import { createHash, timingSafeEqual } from "node:crypto";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpServerResponse } from "effect/unstable/http";

export const ENGINE_TOKEN_ENV = "SATELLA_ENGINE_TOKEN";
export const ENGINE_TOKEN_HEADER = "x-satella-engine-token";
export const MIN_ENGINE_TOKEN_LENGTH = 32;

export class EngineTokenConfigurationError extends Error {
  constructor() {
    super(
      `${ENGINE_TOKEN_ENV} must contain a fresh random value of at least ${MIN_ENGINE_TOKEN_LENGTH} characters.`,
    );
    this.name = "EngineTokenConfigurationError";
  }
}

export interface EngineTokenVerifier {
  readonly verify: (provided: string | undefined) => boolean;
}

export const newEngineToken = (randomBytes: (size: number) => Uint8Array): string =>
  Buffer.from(randomBytes(32)).toString("base64url");

export const makeEngineToken = (secret: string | undefined): EngineTokenVerifier => {
  if (secret === undefined || secret.length < MIN_ENGINE_TOKEN_LENGTH) {
    throw new EngineTokenConfigurationError();
  }
  const expected = createHash("sha256").update(secret, "utf8").digest();
  return {
    verify: (provided) =>
      provided !== undefined &&
      timingSafeEqual(createHash("sha256").update(provided, "utf8").digest(), expected),
  };
};

export class EngineToken extends Context.Service<EngineToken, EngineTokenVerifier>()(
  "@satella-app/engine/EngineToken",
) {}

export const EngineTokenFromSecret = (secret: string | undefined) =>
  Layer.effect(
    EngineToken,
    Effect.try(() => makeEngineToken(secret)),
  );

export const EngineTokenLive = Effect.sync(() =>
  makeEngineToken(process.env[ENGINE_TOKEN_ENV]),
).pipe(Layer.effect(EngineToken));

const requestPath = (url: string) => {
  try {
    return new URL(url, "http://satella.local").pathname;
  } catch {
    return url.split("?", 1)[0] ?? url;
  }
};

const isPublicPath = (path: string) => path === "/api/hello";

const unauthorized = () => HttpServerResponse.text("Unauthorized", { status: 401 });

export const EngineTokenAuth = HttpRouter.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.method === "OPTIONS" || isPublicPath(requestPath(request.url))) {
        return yield* httpApp;
      }
      const token = yield* EngineToken;
      return token.verify(request.headers[ENGINE_TOKEN_HEADER]) ? yield* httpApp : unauthorized();
    }),
  { global: true },
);
