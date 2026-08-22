import { describe, expect, it } from "vite-plus/test";
import { join } from "node:path";

import {
  chooseAvailableEnginePort,
  managedEngineCommand,
  managedEngineEnvironment,
  newEngineToken,
  screenLockRequest,
  vaultStatusRequest,
} from "./engine.js";
import {
  closeToTray,
  externalUrlAction,
  focusWindow,
  navigationPermission,
  shouldQuitOnLastWindow,
  trayIconPath,
  windowLoadTarget,
} from "./window.js";
import { formatLastRefresh, setTrayLanguage, trayMenuItems } from "./tray.js";

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

  it("keeps running when the last window closes on macOS, quits elsewhere", () => {
    expect(shouldQuitOnLastWindow("darwin")).toBe(false);
    expect(shouldQuitOnLastWindow("linux")).toBe(true);
    expect(shouldQuitOnLastWindow("win32")).toBe(true);
  });

  it("hides the window instead of closing it unless the app is quitting", () => {
    const calls: string[] = [];
    const event = { preventDefault: () => calls.push("preventDefault") };
    const window = { hide: () => calls.push("hide") };

    closeToTray(window, () => false)(event);
    expect(calls).toEqual(["preventDefault", "hide"]);

    calls.length = 0;
    closeToTray(window, () => true)(event);
    expect(calls).toEqual([]);
  });

  it("resolves the tray template icon next to the module during development", () => {
    const development = trayIconPath("/app/dist");
    expect(development).toMatch(/assets[/\\]trayTemplate\.png$/);

    const packaged = trayIconPath("/app/dist", {
      isPackaged: true,
      resourcesPath: "/opt/app/resources",
    });
    expect(packaged.endsWith(join("assets", "trayTemplate.png"))).toBe(true);
    expect(packaged.startsWith("/opt/app/resources")).toBe(true);
  });

  it("formats the last refresh time for the tray line", () => {
    const now = new Date(2026, 7, 22, 18, 5);
    expect(formatLastRefresh(null, now)).toBe("Not refreshed yet");
    expect(formatLastRefresh(new Date(2026, 7, 22, 9, 41).toISOString(), now)).toBe(
      "Last refreshed today at 09:41",
    );
    expect(formatLastRefresh(new Date(2026, 6, 4, 23, 8).toISOString(), now)).toBe(
      "Last refreshed Jul 4 at 23:08",
    );
  });

  it("maps the tray menu to its engine actions", () => {
    const calls: string[] = [];
    const items = trayMenuItems(
      { lastCycleAt: new Date(2026, 7, 22, 12, 30).toISOString(), lastCycleOutcome: "success" },
      true,
      {
        open: () => calls.push("open"),
        lockNow: () => calls.push("lock"),
        quit: () => calls.push("quit"),
      },
      new Date(2026, 7, 22, 13, 0),
    );

    expect(items.map(({ label }) => label)).toEqual([
      "Open Satella",
      "Lock Now",
      "Last refreshed today at 12:30",
      "Quit",
    ]);
    const [openItem, lockItem, lastRefreshed, quitItem] = items;
    expect(lastRefreshed?.enabled).toBe(false);
    openItem?.click?.();
    lockItem?.click?.();
    quitItem?.click?.();
    expect(calls).toEqual(["open", "lock", "quit"]);
  });

  it("disables Lock Now when the vault is not open", () => {
    const actions = { open: () => undefined, lockNow: () => undefined, quit: () => undefined };
    expect(
      trayMenuItems(null, true, actions).find(({ label }) => label === "Lock Now")?.enabled,
    ).toBe(true);
    expect(
      trayMenuItems(null, false, actions).find(({ label }) => label === "Lock Now")?.enabled,
    ).toBe(false);
  });

  it("translates the tray menu into French when the App language is French", () => {
    const now = new Date(2026, 7, 22, 18, 5);
    setTrayLanguage("fr");
    try {
      expect(formatLastRefresh(null, now)).toBe("Pas encore actualisé");
      expect(formatLastRefresh(new Date(2026, 7, 22, 9, 41).toISOString(), now)).toBe(
        "Dernière actualisation aujourd'hui à 09:41",
      );
      expect(formatLastRefresh(new Date(2026, 6, 4, 23, 8).toISOString(), now)).toBe(
        "Dernière actualisation le 4 juil. à 23:08",
      );
      expect(
        trayMenuItems(null, true, {
          open: () => undefined,
          lockNow: () => undefined,
          quit: () => undefined,
        }).map(({ label }) => label),
      ).toEqual(["Ouvrir Satella", "Verrouiller maintenant", "Pas encore actualisé", "Quitter"]);
    } finally {
      setTrayLanguage("en");
    }
  });

  it("falls back to English for unknown tray languages", () => {
    setTrayLanguage("de");
    try {
      expect(formatLastRefresh(null)).toBe("Not refreshed yet");
    } finally {
      setTrayLanguage("en");
    }
  });

  it("does not allow an inherited data directory to replace the canonical one", () => {
    expect(
      managedEngineEnvironment(
        { SATELLA_DATA_DIR: "/inherited", PATH: "/bin" },
        { port: 4123, dataDirectory: "/canonical", production: true },
      ),
    ).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      SATELLA_CANONICAL_DATA_DIR: "/canonical",
      SATELLA_DATA_DIR: "/canonical",
      SATELLA_DATABASE_CONTEXT: "production",
    });
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
    const request = screenLockRequest("http://127.0.0.1:3001", "token-value");
    expect(request.url).toBe("http://127.0.0.1:3001/api/vault/lock");
    expect(request.method).toBe("POST");
    expect(request.headers["x-satella-engine-token"]).toBe("token-value");
  });

  it("reads the vault status with the engine token", () => {
    const request = vaultStatusRequest("http://127.0.0.1:3001", "token-value");
    expect(request.url).toBe("http://127.0.0.1:3001/api/vault/status");
    expect(request.method).toBe("GET");
    expect(request.headers["x-satella-engine-token"]).toBe("token-value");
  });

  it("generates a fresh high-entropy engine token for every call", () => {
    const first = newEngineToken();
    const second = newEngineToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("propagates the engine token only through the managed environment", () => {
    const managed = managedEngineEnvironment(
      { PATH: "/bin" },
      { port: 4123, dataDirectory: "/tmp/satella-data", engineToken: "session-secret" },
    );
    expect(managed.SATELLA_ENGINE_TOKEN).toBe("session-secret");
    expect(
      managedEngineEnvironment({ PATH: "/bin" }, { port: 4123, dataDirectory: "/tmp/x" })
        .SATELLA_ENGINE_TOKEN,
    ).toBeUndefined();
  });

  it("points a packaged engine at a local data directory", () => {
    expect(
      managedEngineEnvironment(
        { PATH: "/bin" },
        { port: 4123, dataDirectory: "/tmp/satella-data" },
      ),
    ).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      SATELLA_ENGINE_PORT: "4123",
      SATELLA_DATA_DIR: "/tmp/satella-data",
    });
    expect(
      managedEngineEnvironment(
        {},
        { port: 4123, dataDirectory: "/tmp/satella-data", parentPid: 1234 },
      ).SATELLA_ENGINE_PARENT_PID,
    ).toBe("1234");
  });

  it("passes the Electron logs directory to the engine when provided", () => {
    expect(
      managedEngineEnvironment(
        { SATELLA_DATA_DIR: "/inherited", PATH: "/bin" },
        { port: 4123, dataDirectory: "/canonical", production: true },
      ),
    ).toMatchObject({
      SATELLA_CANONICAL_DATA_DIR: "/canonical",
      SATELLA_DATA_DIR: "/canonical",
      SATELLA_DATABASE_CONTEXT: "production",
    });
    expect(
      managedEngineEnvironment(
        { PATH: "/bin" },
        {
          port: 4123,
          dataDirectory: "/tmp/satella-data",
          logDirectory: "/Users/x/Library/Logs/Satella",
        },
      ).SATELLA_LOG_DIR,
    ).toBe("/Users/x/Library/Logs/Satella");
    expect(
      managedEngineEnvironment({ PATH: "/bin" }, { port: 4123, dataDirectory: "/tmp/d" })
        .SATELLA_LOG_DIR,
    ).toBeUndefined();
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

  it("allows only the configured development origin", () => {
    const context = { developmentUrl: "http://127.0.0.1:5173" };
    expect(navigationPermission("http://127.0.0.1:5173/", context)).toEqual({ type: "allow" });
    expect(navigationPermission("http://localhost:5173/", context)).toEqual({ type: "deny" });
    expect(navigationPermission("http://127.0.0.1:5174/", context)).toEqual({ type: "deny" });
    expect(navigationPermission("https://evil.example/", context)).toEqual({ type: "deny" });
    expect(navigationPermission("http://127.0.0.1:3001/api/hello", {})).toEqual({ type: "deny" });
  });

  it("allows only the packaged Satella document when packaged", () => {
    const context = { isPackaged: true };
    expect(
      navigationPermission(
        "file:///Applications/Satella.app/Contents/Resources/web/dist/index.html",
        context,
      ),
    ).toEqual({ type: "allow" });
    expect(
      navigationPermission(
        "file:///Applications/Satella.app/Contents/Resources/web/dist/other.html",
        context,
      ),
    ).toEqual({ type: "deny" });
    expect(navigationPermission("https://satella.app/", context)).toEqual({ type: "deny" });
  });

  it("denies malformed navigation targets", () => {
    expect(navigationPermission("not a url")).toEqual({ type: "deny" });
  });

  it("sends permitted http and https links to the operating system browser", () => {
    expect(externalUrlAction("https://satella.app/docs")).toEqual({
      action: "open-external",
      url: "https://satella.app/docs",
    });
    expect(externalUrlAction("http://example.com/a?b=1")).toEqual({
      action: "open-external",
      url: "http://example.com/a?b=1",
    });
  });

  it("denies non-web external targets such as file and javascript URLs", () => {
    expect(externalUrlAction("file:///etc/passwd")).toEqual({ action: "deny" });
    expect(externalUrlAction("javascript:alert(1)")).toEqual({ action: "deny" });
    expect(externalUrlAction("data:text/html,hello")).toEqual({ action: "deny" });
    expect(externalUrlAction("https://")).toEqual({ action: "deny" });
    expect(externalUrlAction("not a url")).toEqual({ action: "deny" });
  });
});
