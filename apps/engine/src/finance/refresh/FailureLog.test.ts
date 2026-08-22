import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { describe, expect, it } from "@effect/vitest";

import {
  FAILURE_LOG_FILE_NAME,
  FAILURE_LOG_ROTATION_BYTES,
  FailureLog,
  FailureLogDirectory,
  FailureLogFiles,
} from "./FailureLog.js";
import { layer as FailureLogLive } from "./FailureLog.js";

const makeFiles = (initial: Record<string, string> = {}) => {
  const files = new Map(Object.entries(initial));
  const failNextAppend = { current: false };
  const layer = Layer.succeed(
    FailureLogFiles,
    FailureLogFiles.of({
      append: (path, contents) =>
        Effect.sync(() => {
          if (failNextAppend.current) {
            failNextAppend.current = false;
            throw new Error("disk on fire");
          }
          files.set(path, (files.get(path) ?? "") + contents);
        }),
      fileSize: (path) => Effect.sync(() => files.get(path)?.length ?? null),
      rename: (from, to) =>
        Effect.sync(() => {
          const contents = files.get(from);
          if (contents === undefined) throw new Error("missing file");
          files.delete(from);
          files.set(to, contents);
        }),
    }),
  );
  return { files, failNextAppend, layer };
};

const logLayer = (fixture: ReturnType<typeof makeFiles>, directory = "/logs") =>
  FailureLogLive.pipe(
    Layer.provide(fixture.layer),
    Layer.provide(Layer.succeed(FailureLogDirectory, { directory })),
  );

describe("failure log", () => {
  it("appends a structured entry with timestamp, custodian, code, and message", () => {
    const fixture = makeFiles();
    return Effect.gen(function* () {
      const log = yield* FailureLog;
      yield* log.record({
        custodianId: "okx-1",
        code: "validation",
        message: "Connector authentication failed (credentials)",
      });
      const line = JSON.parse(fixture.files.get(`/logs/${FAILURE_LOG_FILE_NAME}`)!);
      expect(line).toEqual({
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        custodian: "okx-1",
        code: "validation",
        message: "Connector authentication failed (credentials)",
      });
    }).pipe(Effect.provide(logLayer(fixture)), Effect.runPromise);
  });

  it("rotates the file once it reaches roughly one megabyte", () => {
    const path = `/logs/${FAILURE_LOG_FILE_NAME}`;
    const fixture = makeFiles({ [path]: "x".repeat(FAILURE_LOG_ROTATION_BYTES) });
    return Effect.gen(function* () {
      const log = yield* FailureLog;
      yield* log.record({ custodianId: "kraken", code: "connector_unavailable", message: "down" });
      expect(fixture.files.get(`${path}.1`)).toHaveLength(FAILURE_LOG_ROTATION_BYTES);
      const fresh = JSON.parse(fixture.files.get(path)!);
      expect(fresh.custodian).toBe("kraken");
    }).pipe(Effect.provide(logLayer(fixture)), Effect.runPromise);
  });

  it("never fails the caller when the filesystem rejects writes", () => {
    const fixture = makeFiles();
    fixture.failNextAppend.current = true;
    return Effect.gen(function* () {
      const log = yield* FailureLog;
      yield* log.record({ custodianId: "okx", code: "database", message: "nope" });
      expect(fixture.files.get(`/logs/${FAILURE_LOG_FILE_NAME}`)).toBeUndefined();
    }).pipe(Effect.provide(logLayer(fixture)), Effect.runPromise);
  });
});
