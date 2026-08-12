import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import type { IbkrFlexCredentials } from "./schemas.js";

export const IBKR_FLEX_ORIGIN = "https://ndcdyn.interactivebrokers.com";
export const IBKR_FLEX_SEND_REQUEST_PATH = "/AccountManagement/FlexWebService/SendRequest";
export const IBKR_FLEX_GET_STATEMENT_PATH = "/AccountManagement/FlexWebService/GetStatement";
export const IBKR_FLEX_USER_AGENT = "Optimus/0.0 (IBKR Flex connector)";
export const DEFAULT_MAX_FLEX_RESPONSE_BYTES = 8 * 1024 * 1024;

export interface IbkrHttpRequest {
  readonly method: "GET";
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
}

export interface IbkrHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface IbkrHttpTransport<R = never> {
  readonly request: (
    request: IbkrHttpRequest,
  ) => Effect.Effect<IbkrHttpResponse, IbkrTransportError, R>;
}

export class IbkrTransportError extends Error {
  readonly _tag = "IbkrTransportError" as const;
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
    this.name = "IbkrTransportError";
    this.transient = options.transient;
    if (options.status !== undefined) this.status = options.status;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export interface IbkrClientOptions<R = never> {
  readonly transport: IbkrHttpTransport<R>;
  readonly timeout?: Duration.DurationInput;
}

export interface IbkrClient<R = never> {
  readonly sendRequest: (
    credentials: IbkrFlexCredentials,
  ) => Effect.Effect<string, IbkrTransportError, R>;
  readonly getStatement: (input: {
    readonly token: string;
    readonly referenceCode: string;
  }) => Effect.Effect<string, IbkrTransportError, R>;
}

const retryAfterMilliseconds = (headers: Readonly<Record<string, string>>): number | undefined => {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  if (value === undefined) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1_000, 30_000) : undefined;
};

const transientStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

export const makeIbkrEffectHttpTransport = (
  origin = IBKR_FLEX_ORIGIN,
  timeout: Duration.DurationInput = Duration.seconds(15),
  maxResponseBytes = DEFAULT_MAX_FLEX_RESPONSE_BYTES,
): IbkrHttpTransport<HttpClient.HttpClient> & { readonly requiresHttpClient: true } => ({
  requiresHttpClient: true,
  request: (request) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      // Flex responses are never followed as URLs. This prevents a token-bearing
      // request from being redirected outside IBKR's documented HTTPS origin.
      const safeClient = HttpClient.followRedirects(0)(client);
      const url = new URL(`${origin}${request.path}`);
      for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value);
      const response = yield* safeClient
        .execute(
          HttpClientRequest.get(url, {
            headers: request.headers,
            accept: "application/xml, text/xml;q=0.9",
          }),
        )
        .pipe(
          Effect.timeoutFail({
            duration: timeout,
            onTimeout: () => new IbkrTransportError("IBKR request timed out", { transient: true }),
          }),
          Effect.mapError((cause) =>
            cause instanceof IbkrTransportError
              ? cause
              : new IbkrTransportError("IBKR request could not be completed", { transient: true }),
          ),
        );
      const headers: Record<string, string> = {};
      for (const key of ["retry-after", "Retry-After", "content-type", "Content-Type"]) {
        const value = response.headers[key];
        if (value !== undefined) headers[key.toLowerCase()] = value;
      }
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.fail(
          new IbkrTransportError(`IBKR request failed with HTTP ${response.status}`, {
            transient: transientStatus(response.status),
            status: response.status,
            ...(retryAfterMilliseconds(headers) === undefined
              ? {}
              : { retryAfterMs: retryAfterMilliseconds(headers)! }),
          }),
        );
      }
      const body = yield* response.text.pipe(
        Effect.timeoutFail({
          duration: timeout,
          onTimeout: () => new IbkrTransportError("IBKR response timed out", { transient: true }),
        }),
        Effect.mapError((cause) =>
          cause instanceof IbkrTransportError
            ? cause
            : new IbkrTransportError("IBKR response could not be read", { transient: true }),
        ),
      );
      if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
        return yield* Effect.fail(
          new IbkrTransportError("IBKR response is too large", { transient: false }),
        );
      }
      return { status: response.status, headers, body };
    }),
});

const requestHeaders = {
  Accept: "application/xml, text/xml;q=0.9",
  "User-Agent": IBKR_FLEX_USER_AGENT,
};

export const makeIbkrClient = <R>(options: IbkrClientOptions<R>): IbkrClient<R> => {
  const request = (input: IbkrHttpRequest) => options.transport.request(input);

  return {
    sendRequest: (credentials) =>
      request({
        method: "GET",
        path: IBKR_FLEX_SEND_REQUEST_PATH,
        query: { t: credentials.token, q: credentials.queryId, v: "3" },
        headers: requestHeaders,
      }).pipe(Effect.map(({ body }) => body)),
    getStatement: ({ token, referenceCode }) =>
      request({
        method: "GET",
        path: IBKR_FLEX_GET_STATEMENT_PATH,
        query: { t: token, q: referenceCode, v: "3" },
        headers: requestHeaders,
      }).pipe(Effect.map(({ body }) => body)),
  };
};
