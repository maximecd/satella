import { FinanceApiError } from "@optimus/engine/api";
import * as Schema from "effect/Schema";

export const PORTFOLIO_FAILURE_CODES = [
  "not_found",
  "validation",
  "read_only",
  "conflict",
  "connector_unavailable",
  "database",
  "vault_closed",
  "screen_locked",
  "unavailable",
] as const;

export type PortfolioFailureCode = (typeof PORTFOLIO_FAILURE_CODES)[number];

const failureCodes = new Set<string>(PORTFOLIO_FAILURE_CODES);
const isString = Schema.is(Schema.String);

export class PortfolioFailure extends Error {
  readonly code: PortfolioFailureCode;

  constructor(code: PortfolioFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PortfolioFailure";
    this.code = code;
  }
}

type FailureValue = string | number | boolean | null | FailureRecord | ReadonlyArray<FailureValue>;
interface FailureRecord {
  readonly [key: string]: FailureValue;
}

const isRecord = (cause: unknown): cause is FailureRecord =>
  cause !== null &&
  cause !== undefined &&
  (cause instanceof Error || Object.prototype.toString.call(cause) === "[object Object]");

const isResponseLike = (cause: unknown): boolean =>
  isRecord(cause) && Object.prototype.toString.call(cause["arrayBuffer"]) === "[object Function]";

export const isAbortLike = (cause: unknown, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true;
  if (cause instanceof DOMException && cause.name === "AbortError") return true;
  if (cause instanceof Error && cause.name === "AbortError") return true;
  if (!isRecord(cause)) return false;
  if (cause["_tag"] === "Interrupt") return true;
  if (cause["name"] === "AbortError") return true;
  return false;
};

export const abortError = (cause?: unknown): DOMException =>
  cause instanceof DOMException && cause.name === "AbortError"
    ? cause
    : new DOMException("This operation was aborted", "AbortError");

const isPortfolioFailureCode = (candidate: string): candidate is PortfolioFailureCode =>
  failureCodes.has(candidate);

const asFailureCode = (cause: unknown): PortfolioFailureCode | null => {
  if (!isString(cause)) return null;
  return isPortfolioFailureCode(cause) ? cause : null;
};

const financeApiError = (cause: unknown): FinanceApiError | null => {
  if (cause instanceof FinanceApiError) return cause;
  if (!isRecord(cause) || cause["_tag"] !== "FinanceApiError") return null;
  const code = asFailureCode(cause["code"]);
  const message = cause["message"];
  if (code === null || code === "unavailable" || !isString(message)) return null;
  return new FinanceApiError({ code, message });
};

export const tryFinanceApiError = (cause: unknown): PortfolioFailure | null => {
  const engineError = financeApiError(cause);
  if (engineError === null) return null;
  return new PortfolioFailure(engineError.code, engineError.message, { cause });
};

const nestedFailure = (
  cause: unknown,
  depth: number,
  seen: Set<unknown>,
): PortfolioFailure | null => {
  if (depth > 6 || cause === null || cause === undefined) return null;
  if (isRecord(cause)) {
    if (seen.has(cause)) return null;
    seen.add(cause);
  }
  if (cause instanceof PortfolioFailure) return cause;
  const engineError = financeApiError(cause);
  if (engineError !== null) {
    return new PortfolioFailure(engineError.code, engineError.message, { cause });
  }
  if (!isRecord(cause) || isResponseLike(cause)) return null;
  for (const key of ["error", "reason", "cause", "defect"] as const) {
    if (key in cause) {
      const found = nestedFailure(cause[key], depth + 1, seen);
      if (found !== null) return found;
    }
  }
  return null;
};

export const toPortfolioFailure = (cause: unknown): PortfolioFailure => {
  const nested = nestedFailure(cause, 0, new Set());
  if (nested !== null) return nested;
  const message = cause instanceof Error ? cause.message : "The request failed.";
  return new PortfolioFailure("unavailable", message.length > 0 ? message : "The request failed.", {
    cause,
  });
};
