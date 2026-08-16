import { FinanceApiError } from "@optimus/engine/api";

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

export class PortfolioFailure extends Error {
  readonly code: PortfolioFailureCode;

  constructor(code: PortfolioFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PortfolioFailure";
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isResponseLike = (value: unknown): boolean =>
  isRecord(value) && typeof value["arrayBuffer"] === "function";

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

const asFailureCode = (value: unknown): PortfolioFailureCode | null =>
  typeof value === "string" && failureCodes.has(value) ? (value as PortfolioFailureCode) : null;

const financeApiError = (cause: unknown): FinanceApiError | null => {
  if (cause instanceof FinanceApiError) return cause;
  if (!isRecord(cause) || cause["_tag"] !== "FinanceApiError") return null;
  const code = asFailureCode(cause["code"]);
  const message = cause["message"];
  if (code === null || code === "unavailable" || typeof message !== "string") return null;
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
  if (typeof cause === "object") {
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
