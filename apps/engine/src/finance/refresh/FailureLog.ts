import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { appendFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";

export const FAILURE_LOG_FILE_NAME = "refresh-failures.log";
export const FAILURE_LOG_ROTATION_BYTES = 1_000_000;

export class FailureLogFileError extends Data.TaggedError("FailureLogFileError")<{
  readonly cause: unknown;
}> {}

export interface FailureLogEntry {
  readonly custodianId: string;
  readonly code: string;
  readonly message: string;
}

/** Filesystem seam so failure-log behavior is observable without a real disk. */
export class FailureLogFiles extends Context.Service<
  FailureLogFiles,
  {
    readonly append: (path: string, contents: string) => Effect.Effect<void, unknown>;
    readonly fileSize: (path: string) => Effect.Effect<number | null, unknown>;
    readonly rename: (from: string, to: string) => Effect.Effect<void, unknown>;
  }
>()("@satella-app/engine/finance/FailureLogFiles") {}

/** Directory for operational logs, outside the vault. Supplied at engine launch. */
export class FailureLogDirectory extends Context.Service<
  FailureLogDirectory,
  { readonly directory: string }
>()("@satella-app/engine/finance/FailureLogDirectory") {}

export class FailureLog extends Context.Service<
  FailureLog,
  {
    readonly record: (entry: FailureLogEntry) => Effect.Effect<void>;
  }
>()("@satella-app/engine/finance/FailureLog") {}

const serialize = (entry: FailureLogEntry) =>
  `${JSON.stringify({
    timestamp: new Date().toISOString(),
    custodian: entry.custodianId,
    code: entry.code,
    message: entry.message,
  })}\n`;

export const make = Effect.gen(function* () {
  const files = yield* FailureLogFiles;
  const directory = (yield* FailureLogDirectory).directory;
  const logPath = join(directory, FAILURE_LOG_FILE_NAME);
  const rotatedPath = `${logPath}.1`;
  return FailureLog.of({
    record: (entry) =>
      Effect.gen(function* () {
        const line = serialize(entry);
        const size = yield* files.fileSize(logPath);
        if (size !== null && size + line.length > FAILURE_LOG_ROTATION_BYTES) {
          yield* files.rename(logPath, rotatedPath);
        }
        yield* files.append(logPath, line);
      }).pipe(
        Effect.catchDefect(() => Effect.void),
        Effect.ignore,
      ),
  });
});

export const layer = Layer.effect(FailureLog, make);

export const NodeFailureLogFilesLive = Layer.succeed(
  FailureLogFiles,
  FailureLogFiles.of({
    append: (path, contents) =>
      Effect.tryPromise({
        try: () => appendFile(path, contents, "utf8"),
        catch: (cause) => new FailureLogFileError({ cause }),
      }),
    fileSize: (path) =>
      Effect.promise(async () => {
        try {
          return (await stat(path)).size;
        } catch {
          return null;
        }
      }),
    rename: (from, to) =>
      Effect.tryPromise({
        try: () => rename(from, to),
        catch: (cause) => new FailureLogFileError({ cause }),
      }),
  }),
);
