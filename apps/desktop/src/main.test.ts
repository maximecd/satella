import { describe, expect, it } from "vite-plus/test";

import { managedEngineCommand, managedEngineEnvironment, screenLockRequest } from "./engine.js";
import { shouldQuitOnLastWindow, windowLoadTarget } from "./window.js";

describe("desktop main process helpers", () => {
  it("loads the development URL when provided", () => {
    expect(windowLoadTarget("http://127.0.0.1:5173")).toEqual({
      type: "url",
      url: "http://127.0.0.1:5173",
    });
  });

  it("loads the packaged web build otherwise", () => {
    const target = windowLoadTarget(undefined);
    expect(target).toEqual({
      type: "file",
      path: expect.stringMatching(/web[/\\]dist[/\\]index\.html$/),
    });
  });

  it("quits when the last window closes, including on macOS", () => {
    expect(shouldQuitOnLastWindow("darwin")).toBe(true);
    expect(shouldQuitOnLastWindow("linux")).toBe(true);
    expect(shouldQuitOnLastWindow("win32")).toBe(true);
  });

  it("does not spawn a second engine during development URL loads", () => {
    expect(managedEngineCommand("http://127.0.0.1:5173")).toBeUndefined();
    expect(managedEngineCommand(undefined)?.args.at(-1)).toMatch(/engine[/\\]dist[/\\]main\.mjs$/);
  });

  it("asks the engine to Screen lock on session lock and sleep", () => {
    expect(screenLockRequest("http://127.0.0.1:3001")).toEqual({
      url: "http://127.0.0.1:3001/api/vault/lock",
      method: "POST",
    });
  });

  it("points a packaged engine at a local data directory", () => {
    expect(
      managedEngineEnvironment({ PATH: "/bin" }, { port: 4123, dataDirectory: "/tmp/optimus-data" }),
    ).toMatchObject({
      OPTIMUS_ENGINE_PORT: "4123",
      OPTIMUS_DATA_DIR: "/tmp/optimus-data",
    });
  });
});
