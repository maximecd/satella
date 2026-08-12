import * as Cause from "effect/Cause";
import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as HttpServerRequest from "@effect/platform/HttpServerRequest";

const diagnosticText = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = ["_tag", "code", "category", "status", "message"]
      .filter((key) => key in record)
      .map((key) => `${key}=${String(record[key])}`);
    return fields.length > 0 ? fields.join(" ") : Object.prototype.toString.call(value);
  }
  return Object.prototype.toString.call(value);
};

/** Keep API diagnostics useful without turning an accidental error into a secret dump. */
const redactDiagnostic = (value: string): string =>
  value
    .replace(
      /(["']?)(token|query(?:[_ ]?id)?|reference(?:[_ ]?code)?|password|secret(?:key)?|api[_ -]?key)\1\s*[:=]\s*["']?[^,\s}"']+/gi,
      "$2=<redacted>",
    )
    .replace(/\b(token|query(?:\s+id)?|reference(?:\s+code)?)\s+[^\s,;)]*/gi, "$1 <redacted>")
    .replace(/\b(?:U|DU|F)\d{4,}\b/gi, "<account-id>")
    .replace(/\bconid\s+[^\s,;)]*/gi, "conid <redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);

const causeSummary = <E>(cause: Cause.Cause<E>): string => {
  const failures = Chunk.toReadonlyArray(Cause.failures(cause));
  const defects = Chunk.toReadonlyArray(Cause.defects(cause));
  const parts = [
    ...failures
      .slice(0, 4)
      .map((failure) => `failure=${redactDiagnostic(diagnosticText(failure))}`),
    ...defects.slice(0, 4).map((defect) => `defect=${redactDiagnostic(diagnosticText(defect))}`),
  ];
  if (parts.length === 0 && Cause.isInterruptedOnly(cause)) return "interrupted";
  return parts.length === 0 ? "unknown" : parts.join("; ");
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
export const ApiErrorLogging = HttpApiBuilder.middleware((httpApp) =>
  httpApp.pipe(
    Effect.tapErrorCause((cause) =>
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
);
