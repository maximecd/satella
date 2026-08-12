import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { createHmac } from "node:crypto";

import {
  OkxConfigResponse,
  OkxCredentials,
  OkxFundingBalanceResponse,
  OkxRegion,
  OkxTimeResponse,
  OkxTradingBalanceResponse,
} from "./schemas.js";

export interface OkxHttpRequest {
  readonly method: "GET";
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface OkxHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface OkxHttpTransport<R = never> {
  readonly request: (
    request: OkxHttpRequest,
  ) => Effect.Effect<OkxHttpResponse, OkxTransportError, R>;
}

export class OkxTransportError extends Error {
  readonly _tag = "OkxTransportError" as const;
  readonly transient: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: {
      readonly transient: boolean;
      readonly status?: number;
      readonly retryAfterMs?: number;
    },
  ) {
    super(message);
    this.name = "OkxTransportError";
    this.transient = options.transient;
    if (options.status !== undefined) this.status = options.status;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export const OKX_REST_ORIGINS: Readonly<Record<OkxRegion, string>> = {
  global: "https://openapi.okx.com",
  eea: "https://eea.okx.com",
  us: "https://us.okx.com",
};

export const okxRestOrigin = (region: OkxRegion): string => OKX_REST_ORIGINS[region];

const retryAfterMilliseconds = (headers: Readonly<Record<string, string>>): number | undefined => {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  if (value === undefined) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1_000, 30_000) : undefined;
};

export const makeEffectHttpTransport = (
  origin: string,
  timeout: Duration.DurationInput = Duration.seconds(10),
): OkxHttpTransport<HttpClient.HttpClient> & { readonly requiresHttpClient: true } => ({
  requiresHttpClient: true,
  request: (request) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client
        .execute(
          HttpClientRequest.get(`${origin}${request.path}`, {
            headers: request.headers,
            acceptJson: true,
          }),
        )
        .pipe(
          Effect.timeoutFail({
            duration: timeout,
            onTimeout: () => new OkxTransportError("OKX request timed out", { transient: true }),
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof OkxTransportError
              ? cause
              : new OkxTransportError("OKX request could not be completed", { transient: true }),
          ),
        );
      const body = yield* response.json.pipe(Effect.catchAll(() => Effect.succeed(undefined)));
      const headers: Record<string, string> = {};
      for (const key of ["retry-after", "Retry-After"]) {
        const value = response.headers[key];
        if (value !== undefined) headers[key.toLowerCase()] = value;
      }
      return { status: response.status, headers, body };
    }),
});

export const signOkxRequest = (input: {
  readonly timestamp: string;
  readonly method: string;
  readonly requestPath: string;
  readonly body?: string;
  readonly secretKey: string;
}): string =>
  createHmac("sha256", input.secretKey)
    .update(
      `${input.timestamp}${input.method.toUpperCase()}${input.requestPath}${input.body ?? ""}`,
    )
    .digest("base64");

export interface OkxClientOptions<R = never> {
  readonly transport: OkxHttpTransport<R>;
  readonly now?: () => Date;
  readonly maxAttempts?: number;
}

export interface OkxClient<R = never> {
  readonly synchronizeClock: () => Effect.Effect<number, OkxTransportError, R>;
  readonly request: <A>(input: {
    readonly credentials: OkxCredentials;
    readonly path: string;
    readonly schema: Schema.Schema<A, any>;
    readonly clockOffsetMs: number;
  }) => Effect.Effect<A, OkxTransportError | ParseResult.ParseError, R>;
}

const transientStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const parseResponse = <A>(
  response: OkxHttpResponse,
  schema: Schema.Schema<A, any>,
): Effect.Effect<A, OkxTransportError | ParseResult.ParseError> => {
  if (response.status < 200 || response.status >= 300) {
    const retryAfterMs = retryAfterMilliseconds(response.headers);
    return Effect.fail(
      new OkxTransportError(`OKX request failed with HTTP ${response.status}`, {
        transient: transientStatus(response.status),
        status: response.status,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      }),
    );
  }
  return Schema.decodeUnknown(schema)(response.body);
};

export const makeOkxClient = <R>(options: OkxClientOptions<R>): OkxClient<R> => {
  const now = options.now ?? (() => new Date());
  const configuredAttempts = options.maxAttempts ?? 3;
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.max(1, Math.floor(configuredAttempts))
    : 3;

  const requestWithRetry = <A>(
    input: OkxHttpRequest,
    schema: Schema.Schema<A, any>,
  ): Effect.Effect<A, OkxTransportError, R> => {
    const attempt = options.transport.request(input).pipe(
      Effect.flatMap((response) => parseResponse(response, schema)),
      Effect.mapError((cause) =>
        cause instanceof OkxTransportError
          ? cause
          : new OkxTransportError("OKX returned an invalid response", { transient: false }),
      ),
    );
    const retry = (
      remaining: number,
      attemptNumber: number,
    ): Effect.Effect<A, OkxTransportError, R> =>
      attempt.pipe(
        Effect.catchAll((cause) => {
          if (!cause.transient || remaining === 0) return Effect.fail(cause);
          const delay = cause.retryAfterMs ?? Math.min(100 * 2 ** attemptNumber, 1_000);
          return Effect.sleep(Duration.millis(delay)).pipe(
            Effect.flatMap(() => retry(remaining - 1, attemptNumber + 1)),
          );
        }),
      ) as Effect.Effect<A, OkxTransportError, R>;
    return retry(maxAttempts - 1, 0);
  };

  const synchronizeClock = (): Effect.Effect<number, OkxTransportError, R> =>
    Effect.gen(function* () {
      const response = yield* requestWithRetry(
        { method: "GET", path: "/api/v5/public/time", headers: { Accept: "application/json" } },
        OkxTimeResponse,
      );
      const first = response.data[0];
      if (first === undefined) {
        return yield* Effect.fail(
          new OkxTransportError("OKX returned no server time", { transient: false }),
        );
      }
      const serverTimestamp = Number(first.ts);
      if (!Number.isFinite(serverTimestamp)) {
        return yield* Effect.fail(
          new OkxTransportError("OKX returned an invalid server time", { transient: false }),
        );
      }
      return serverTimestamp - now().getTime();
    });

  const request = <A>(input: {
    readonly credentials: OkxCredentials;
    readonly path: string;
    readonly schema: Schema.Schema<A, any>;
    readonly clockOffsetMs: number;
  }) => {
    const timestamp = new Date(now().getTime() + input.clockOffsetMs).toISOString();
    return requestWithRetry(
      {
        method: "GET",
        path: input.path,
        headers: {
          Accept: "application/json",
          "OK-ACCESS-KEY": input.credentials.apiKey,
          "OK-ACCESS-SIGN": signOkxRequest({
            timestamp,
            method: "GET",
            requestPath: input.path,
            secretKey: input.credentials.secretKey,
          }),
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": input.credentials.passphrase,
          ...(input.credentials.environment === "demo" ? { "x-simulated-trading": "1" } : {}),
        },
      },
      input.schema,
    );
  };

  return { synchronizeClock, request };
};

export type OkxEndpointResponse =
  | typeof OkxTimeResponse.Type
  | typeof OkxConfigResponse.Type
  | typeof OkxTradingBalanceResponse.Type
  | typeof OkxFundingBalanceResponse.Type;
