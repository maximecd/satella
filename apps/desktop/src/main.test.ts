import { describe, expect, it } from "vite-plus/test";

import {
  chooseAvailableEnginePort,
  managedEngineCommand,
  managedEngineEnvironment,
  screenLockRequest,
} from "./engine.js";
import { focusWindow, shouldQuitOnLastWindow, windowLoadTarget } from "./window.js";

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
    expect(
      windowLoadTarget(undefined, "/app/dist", {
        isPackaged: true,
        resourcesPath: "/app/resources",
      }),
    ).toEqual({
      type: "file",
      path: "/app/resources/web/dist/index.html",
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
    expect(
      managedEngineCommand(undefined, "/app/dist", {
        isPackaged: true,
        resourcesPath: "/app/resources",
      })?.args.at(-1),
    ).toBe("/app/resources/engine/dist/main.mjs");
  });

  it("asks the engine to Screen lock on session lock and sleep", () => {
    expect(screenLockRequest("http://127.0.0.1:3001")).toEqual({
      url: "http://127.0.0.1:3001/api/vault/lock",
      method: "POST",
    });
  });

  it("points a packaged engine at a local data directory", () => {
    expect(
      managedEngineEnvironment(
        { PATH: "/bin" },
        { port: 4123, dataDirectory: "/tmp/optimus-data" },
      ),
    ).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      OPTIMUS_ENGINE_PORT: "4123",
      OPTIMUS_DATA_DIR: "/tmp/optimus-data",
    });
    expect(
      managedEngineEnvironment(
        {},
        { port: 4123, dataDirectory: "/tmp/optimus-data", parentPid: 1234 },
      ).OPTIMUS_ENGINE_PARENT_PID,
    ).toBe("1234");
  });

  it("does not allow an inherited data directory to replace the canonical one", () => {
    expect(
      managedEngineEnvironment(
        { OPTIMUS_DATA_DIR: "/inherited", PATH: "/bin" },
        { port: 4123, dataDirectory: "/canonical", production: true },
      ),
    ).toMatchObject({
      OPTIMUS_CANONICAL_DATA_DIR: "/canonical",
      OPTIMUS_DATA_DIR: "/canonical",
      OPTIMUS_DATABASE_CONTEXT: "production",
    });
  });

  it("chooses the first available loopback port", async () => {
    const occupied = new Set([3001, 3002]);
    await expect(
      chooseAvailableEnginePort(3001, async (port) => !occupied.has(port)),
    ).resolves.toBe(3003);
  });

  it("focuses the existing window for a second launch", () => {
    const calls: string[] = [];
    focusWindow({
      isMinimized: () => true,
      restore: () => calls.push("restore"),
      show: () => calls.push("show"),
      focus: () => calls.push("focus"),
    });
    expect(calls).toEqual(["restore", "show", "focus"]);
  });
});
