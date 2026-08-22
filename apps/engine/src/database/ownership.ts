import * as Effect from "effect/Effect";
import { readFileSync, unlinkSync } from "node:fs";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DatabaseConfigError, DatabaseOwnedError } from "./errors.js";

export const OWNERSHIP_FILE_NAME = "engine.lock";

const ownershipPath = (dataDirectory: string) => join(dataDirectory, OWNERSHIP_FILE_NAME);

const isEnoent = (cause: unknown) =>
  cause instanceof Error && "code" in cause && cause.code === "ENOENT";

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return cause instanceof Error && "code" in cause && cause.code === "EPERM";
  }
};

const parseOwnershipPid = (contents: string) => {
  const pid = Number.parseInt(contents.trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
};

const liveOwnerPid = (contents: string | undefined) => {
  if (contents === undefined) return undefined;
  const pid = parseOwnershipPid(contents);
  if (pid === undefined || pid === process.pid || !isProcessAlive(pid)) return undefined;
  return pid;
};

const readOwnershipFile = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await readFile(path, "utf8");
      } catch (cause) {
        if (isEnoent(cause)) return undefined;
        throw cause;
      }
    },
    catch: (cause) =>
      new DatabaseConfigError({
        reason: "filesystem",
        path,
        cause,
        message: `Could not read database ownership: ${path}`,
      }),
  });

const removeOwnershipFile = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        await unlink(path);
      } catch (cause) {
        if (!isEnoent(cause)) throw cause;
      }
    },
    catch: (cause) =>
      new DatabaseConfigError({
        reason: "filesystem",
        path,
        cause,
        message: `Could not repair stale database ownership: ${path}`,
      }),
  });

export const assertDatabaseUnlocked = (dataDirectory: string, databasePath: string) =>
  Effect.gen(function* () {
    const path = ownershipPath(dataDirectory);
    const contents = yield* readOwnershipFile(path);
    const pid = liveOwnerPid(contents);
    if (pid === undefined) {
      if (contents !== undefined) yield* removeOwnershipFile(path);
      return;
    }
    return yield* Effect.fail(
      new DatabaseOwnedError({
        path: databasePath,
        pid,
        message: `The Satella engine (pid ${pid}) owns this database: ${databasePath}. Stop the engine before resetting or seeding.`,
      }),
    );
  });

export const claimDatabaseOwnership = (dataDirectory: string) =>
  Effect.gen(function* () {
    const path = ownershipPath(dataDirectory);
    const contents = yield* readOwnershipFile(path);
    if (liveOwnerPid(contents) !== undefined) return;
    yield* Effect.tryPromise({
      try: async () => {
        await writeFile(path, `${process.pid}\n`, { encoding: "utf8", mode: 0o600 });
        await chmod(path, 0o600);
      },
      catch: (cause) =>
        new DatabaseConfigError({
          reason: "filesystem",
          path,
          cause,
          message: `Could not record engine ownership of the database: ${path}`,
        }),
    });
  });

export const releaseDatabaseOwnership = (dataDirectory: string) =>
  Effect.gen(function* () {
    const path = ownershipPath(dataDirectory);
    const contents = yield* readOwnershipFile(path);
    if (contents === undefined) return;
    if (parseOwnershipPid(contents) === process.pid) {
      yield* removeOwnershipFile(path);
    }
  }).pipe(Effect.ignore);

export const releaseDatabaseOwnershipSync = (dataDirectory: string) => {
  try {
    const path = ownershipPath(dataDirectory);
    if (readFileSync(path, "utf8").trim() === String(process.pid)) {
      unlinkSync(path);
    }
  } catch {
    // Process-exit cleanup is best-effort and must not mask the original exit.
  }
};
