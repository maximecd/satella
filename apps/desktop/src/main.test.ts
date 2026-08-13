import { describe, expect, it } from "vite-plus/test";

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

  it("keeps the app running on macOS after the last window closes", () => {
    expect(shouldQuitOnLastWindow("darwin")).toBe(false);
    expect(shouldQuitOnLastWindow("linux")).toBe(true);
    expect(shouldQuitOnLastWindow("win32")).toBe(true);
  });
});
