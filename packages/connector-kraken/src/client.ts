import { HttpBody, HttpClient, HttpClientRequest } from "effect/unstable/http";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { createHash, createHmac } from "node:crypto";

import { KrakenCredentials } from "./schemas.js";

export interface KrakenHttpRequest {
  readonly method: "POST";
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface KrakenHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface KrakenHttpTransport<R = never> {
  readonly request: (
    request: KrakenHttpRequest,
  ) => Effect.Effect<KrakenHttpResponse, KrakenTransportError, R>;
}

export class KrakenTransportError extends Error {
  readonly _tag = "KrakenTransportError" as const;
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
    this.name = "KrakenTransportError";
    this.transient = options.transient;
    if (options.status !== undefined) this.status = options.status;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export const KRAKEN_REST_ORIGIN = "https://api.kraken.com";

const retryAfterMilliseconds = (headers: Readonly<Record<string, string>>): number | undefined => {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  if (value === undefined) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1_000, 30_000) : undefined;
};

export const makeEffectHttpTransport = (
  origin: string = KRAKEN_REST_ORIGIN,
  timeout: Duration.Duration = Duration.seconds(10),
): KrakenHttpTransport<HttpClient.HttpClient> & { readonly requiresHttpClient: true } => ({
  requiresHttpClient: true,
  request: (request) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client
        .execute(
          HttpClientRequest.post(`${origin}${request.path}`, {
            headers: request.headers,
            acceptJson: true,
            body: HttpBody.uint8Array(
              new TextEncoder().encode(request.body),
              request.headers["Content-Type"] ?? "application/x-www-form-urlencoded",
            ),
          }),
        )
        .pipe(
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () =>
              Effect.fail(
                new KrakenTransportError("Kraken request timed out", { transient: true }),
              ),
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof KrakenTransportError
              ? cause
              : new KrakenTransportError("Kraken request could not be completed", {
                  transient: true,
                }),
          ),
        );
      const body = yield* response.json.pipe(Effect.catch(() => Effect.succeed(undefined)));
      const headers: Record<string, string> = {};
      for (const key of ["retry-after", "Retry-After"]) {
        const value = response.headers[key];
        if (value !== undefined) headers[key.toLowerCase()] = value;
      }
      return { status: response.status, headers, body };
    }),
});

/**
 * Kraken's documented signature: HMAC-SHA512 over
 * `URI path + SHA256(nonce + POST data)` keyed with the base64-decoded secret.
 */
export const signKrakenRequest = (input: {
  readonly path: string;
  readonly nonce: string;
  readonly body: string;
  readonly secret: string;
}): string => {
  const hash = createHash("sha256").update(`${input.nonce}${input.body}`).digest();
  return createHmac("sha512", Buffer.from(input.secret, "base64"))
    .update(Buffer.concat([Buffer.from(input.path, "utf8"), hash]))
    .digest("base64");
};

export interface KrakenClientOptions<R = never> {
  readonly transport: KrakenHttpTransport<R>;
  readonly now?: () => Date;
  readonly maxAttempts?: number;
}

export interface KrakenClient<R = never> {
  readonly request: <A>(input: {
    readonly credentials: KrakenCredentials;
    readonly path: string;
    readonly schema: Schema.Codec<A>;
    readonly extraParameters?: Readonly<Record<string, string>>;
  }) => Effect.Effect<A, KrakenTransportError | Schema.SchemaError, R>;
}

const transientStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const parseResponse = <A>(
  response: KrakenHttpResponse,
  schema: Schema.Codec<A>,
): Effect.Effect<A, KrakenTransportError | Schema.SchemaError> => {
  if (response.status < 200 || response.status >= 300) {
    const retryAfterMs = retryAfterMilliseconds(response.headers);
    const errorOptions = {
      transient: transientStatus(response.status),
      status: response.status,
    };
    if (retryAfterMs !== undefined) Object.assign(errorOptions, { retryAfterMs });
    return Effect.fail(
      new KrakenTransportError(`Kraken request failed with HTTP ${response.status}`, errorOptions),
    );
  }
  return Schema.decodeUnknownEffect(schema)(response.body);
};

/**
 * Kraken rejects nonces lower than the last one seen per API key, so the
 * millisecond clock is guarded by a monotonic counter.
 */
export const makeNonceCounter = (now: () => Date = () => new Date()) => {
  let previous = 0;
  return (): string => {
    const candidate = Math.max(now().getTime(), previous + 1);
    previous = candidate;
    return String(candidate);
  };
};

export const makeKrakenClient = <R>(options: KrakenClientOptions<R>): KrakenClient<R> => {
  const now = options.now ?? (() => new Date());
  const configuredAttempts = options.maxAttempts ?? 3;
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.max(1, Math.floor(configuredAttempts))
    : 3;
  const nextNonce = makeNonceCounter(now);

  const requestWithRetry = <A>(
    input: KrakenHttpRequest,
    schema: Schema.Codec<A>,
  ): Effect.Effect<A, KrakenTransportError, R> => {
    const attempt = options.transport.request(input).pipe(
      Effect.flatMap((response) => parseResponse(response, schema)),
      Effect.mapError((cause) =>
        cause instanceof KrakenTransportError
          ? cause
          : new KrakenTransportError("Kraken returned an invalid response", {
              transient: false,
            }),
      ),
    );
    const retry = (
      remaining: number,
      attemptNumber: number,
    ): Effect.Effect<A, KrakenTransportError, R> =>
      attempt.pipe(
        Effect.catch((cause) => {
          if (!cause.transient || remaining === 0) return Effect.fail(cause);
          const delay = cause.retryAfterMs ?? Math.min(100 * 2 ** attemptNumber, 1_000);
          return Effect.sleep(Duration.millis(delay)).pipe(
            Effect.flatMap(() => retry(remaining - 1, attemptNumber + 1)),
          );
        }),
      );
    return retry(maxAttempts - 1, 0);
  };

  const request = <A>(input: {
    readonly credentials: KrakenCredentials;
    readonly path: string;
    readonly schema: Schema.Codec<A>;
    readonly extraParameters?: Readonly<Record<string, string>>;
  }) => {
    const nonce = nextNonce();
    const parameters = new URLSearchParams({ nonce, ...input.extraParameters });
    const body = parameters.toString();
    return requestWithRetry(
      {
        method: "POST",
        path: input.path,
        headers: {
          Accept: "application/json",
          "API-Key": input.credentials.apiKey,
          "API-Sign": signKrakenRequest({
            path: input.path,
            nonce,
            body,
            secret: input.credentials.apiSecret,
          }),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
      input.schema,
    );
  };

  return { request };
};
