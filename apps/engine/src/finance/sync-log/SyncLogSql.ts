import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SqlClient } from "effect/unstable/sql";

import type {
  SyncLogAction,
  SyncLogEntry,
  SyncLogOutcome,
  SyncLogPage,
  SyncLogSubjectKind,
} from "../contracts.js";
import { FinanceApiError } from "../contracts.js";
import { db, failure, type FinanceEffect } from "../internal/sql.js";

export const SYNC_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const DEFAULT_SYNC_LOG_PAGE_SIZE = 50;
export const MAX_SYNC_LOG_PAGE_SIZE = 100;

export const sanitizePriceFailureReason = (category: string) => {
  switch (category) {
    case "missing-lookup":
      return "No market-data identifier is available.";
    case "not-found":
    case "missing-result":
      return "No price was returned.";
    case "invalid-response":
      return "The price response was invalid.";
    case "rate-limit":
      return "The market-data request was rate-limited.";
    case "network":
      return "The market-data request could not reach its service.";
    case "server":
      return "The market-data service was unavailable.";
    default:
      return "The price could not be checked.";
  }
};

export const sanitizeCustodianFailureReason = (code: string, message = "") => {
  if (
    code === "connector_unavailable" ||
    /connector (authentication|account fetch)/i.test(message)
  ) {
    return "The Custodian's linked service is unavailable.";
  }
  return "The Custodian could not be refreshed.";
};

export interface RecordSyncLogInput {
  readonly completedAt?: Date;
  readonly subjectKind: SyncLogSubjectKind;
  readonly subjectName: string;
  readonly action: SyncLogAction;
  readonly outcome: SyncLogOutcome;
  readonly failureReason?: string | null;
}

export interface ListSyncLogInput {
  readonly cursor?: string;
  readonly limit?: number;
}

interface SyncLogRow {
  readonly id: string;
  readonly completed_at: string;
  readonly subject_kind: SyncLogSubjectKind;
  readonly subject_name: string;
  readonly action: SyncLogAction;
  readonly outcome: SyncLogOutcome;
  readonly failure_reason: string | null;
}

const toEntry = (row: SyncLogRow): SyncLogEntry => ({
  id: row.id,
  completedAt: row.completed_at,
  subjectKind: row.subject_kind,
  subjectName: row.subject_name,
  action: row.action,
  outcome: row.outcome,
  failureReason: row.failure_reason,
});

const cursorFor = (entry: Pick<SyncLogEntry, "completedAt" | "id">) =>
  Buffer.from(JSON.stringify([entry.completedAt, entry.id]), "utf8").toString("base64url");

const SyncLogCursor = Schema.Tuple([Schema.String, Schema.String]);

const decodeCursor = (cursor: string): readonly [string, string] | undefined => {
  try {
    return Schema.decodeUnknownSync(SyncLogCursor)(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    // Invalid cursors are rejected below with a normal API validation error.
  }
  return undefined;
};

const failureReason = (input: RecordSyncLogInput) => {
  if (input.outcome === "success") return null;
  const reason = input.failureReason?.trim();
  return reason === undefined || reason.length === 0 ? null : reason;
};

/** Writes one terminal entry and removes entries strictly older than thirty days. */
export const recordSyncLog = (
  input: RecordSyncLogInput,
  options: { readonly now?: () => Date } = {},
): FinanceEffect<void> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = options.now?.() ?? new Date();
    const completedAt = (input.completedAt ?? now).toISOString();
    const id = randomUUID();
    const reason = failureReason(input);
    const cutoff = new Date(now.getTime() - SYNC_LOG_RETENTION_MS).toISOString();
    yield* db(sql`INSERT INTO sync_log
      (id, completed_at, subject_kind, subject_name, action, outcome, failure_reason)
      VALUES (${id}, ${completedAt}, ${input.subjectKind}, ${input.subjectName.trim()},
        ${input.action}, ${input.outcome}, ${reason})`);
    yield* db(sql`DELETE FROM sync_log WHERE completed_at < ${cutoff}`);
  });

export const listSyncLog = (input: ListSyncLogInput = {}): FinanceEffect<SyncLogPage> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const requestedLimit = input.limit ?? DEFAULT_SYNC_LOG_PAGE_SIZE;
    if (!Number.isFinite(requestedLimit) || !Number.isInteger(requestedLimit)) {
      return yield* Effect.fail(failure("validation", "The Sync log limit is invalid"));
    }
    const limit = Math.min(MAX_SYNC_LOG_PAGE_SIZE, Math.max(1, requestedLimit));
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    if (input.cursor !== undefined && cursor === undefined) {
      return yield* Effect.fail(failure("validation", "The Sync log cursor is invalid"));
    }
    const rows =
      cursor === undefined
        ? yield* db(sql<SyncLogRow>`SELECT id, completed_at, subject_kind, subject_name,
            action, outcome, failure_reason FROM sync_log
            ORDER BY completed_at DESC, id DESC LIMIT ${limit + 1}`)
        : yield* db(sql<SyncLogRow>`SELECT id, completed_at, subject_kind, subject_name,
            action, outcome, failure_reason FROM sync_log
            WHERE completed_at < ${cursor[0]}
              OR (completed_at = ${cursor[0]} AND id < ${cursor[1]})
            ORDER BY completed_at DESC, id DESC LIMIT ${limit + 1}`);
    const entries = rows.slice(0, limit).map(toEntry);
    return {
      entries,
      nextCursor:
        rows.length > limit && entries.at(-1) !== undefined ? cursorFor(entries.at(-1)!) : null,
    };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof FinanceApiError
        ? cause
        : failure("database", "The Sync log could not be read"),
    ),
  );
