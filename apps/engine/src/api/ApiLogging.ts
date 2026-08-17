import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";

import { HttpRouter } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http";

const diagnosticCredentialKeys =
  "token|query(?:[_ ]?id)?|reference(?:[_ ]?code)?|password|pin|dek|secret(?:key)?|api[_ -]?key";
const diagnosticCredentialPattern = new RegExp(
  `(["']?)(${diagnosticCredentialKeys})\\1\\s*[:=]\\s*` +
    `(?:"[^"]*"|'[^']*'|(?:(?!\\s+(?:${diagnosticCredentialKeys})\\s*[:=])[^,;}\\n&])+)`,
  "gi",
);

export const redactDiagnostic = (value: string): string =>
  value
    .replace(diagnosticCredentialPattern, "$2=<redacted>")
    .replace(/\b(token|query(?:\s+id)?|reference(?:\s+code)?)\s+[^\s,;)]*/gi, "$1 <redacted>")
    .replace(/\b(?:U|DU|F)\d{4,}\b/gi, "<account-id>")
    .replace(/\bconid\s+[^\s,;)]*/gi, "conid <redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);

const causeSummary = <E>(cause: Cause.Cause<E>): string => {
  if (Cause.hasInterruptsOnly(cause)) return "interrupted";
  const pretty = redactDiagnostic(Cause.pretty(cause));
  return pretty.length === 0 ? "unknown" : pretty;
};

const requestPath = (request: HttpServerRequest.HttpServerRequest): string => {
  try {
    return new URL(request.url, "http://optimus.local").pathname;
  } catch {
    return request.url.split("?", 1)[0] ?? request.url;
  }
};

/**
 * API-wide failure logging. It runs before HttpApiBuilder turns typed endpoint
 * failures into HTTP responses, so every failed Effect request is visible in
 * the engine's Node log without adding taps to individual services.
 */
export const ApiErrorLogging = HttpRouter.middleware(
  (httpApp) =>
    httpApp.pipe(
      Effect.tapCause((cause) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          yield* Effect.logError("API effect failed").pipe(
            Effect.annotateLogs("http_method", request.method),
            Effect.annotateLogs("http_path", requestPath(request)),
            Effect.annotateLogs("error", causeSummary(cause)),
          );
        }),
      ),
    ),
  { global: true },
);
