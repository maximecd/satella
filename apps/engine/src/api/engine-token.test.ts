import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { ENGINE_TOKEN_HEADER } from "../api/EngineToken.js";
import { startEngine } from "../database/development-database.test-utils.js";

const waitForEngineHello = async (port: number) => {
  const url = `http://127.0.0.1:${port}/api/hello`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Engine is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Engine HTTP was not ready");
};

describe("engine token authentication", () => {
  const directories: string[] = [];
  const engines: Array<Awaited<ReturnType<typeof startEngine>>> = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const start = async (token: string) => {
    const directory = await mkdtemp(join(tmpdir(), "satella-engine-token-"));
    directories.push(directory);
    const engine = await startEngine({
      cwd: process.cwd(),
      env: { SATELLA_DATA_DIR: directory, SATELLA_ENGINE_TOKEN: token },
    });
    engines.push(engine);
    await waitForEngineHello(engine.port);
    return engine;
  };

  it("keeps the health endpoint public but rejects privileged requests without the current token", async () => {
    const engine = await start("launch-secret-token-0123456789abcdef");
    const hello = await fetch(`http://127.0.0.1:${engine.port}/api/hello`);
    expect(hello.status).toBe(200);

    for (const path of ["/api/vault/status", "/api/dashboard"]) {
      const missing = await fetch(`http://127.0.0.1:${engine.port}${path}`);
      const missingBody = await missing.text();
      expect(missing.status).toBe(401);
      expect(missingBody).not.toContain("state");

      const wrong = await fetch(`http://127.0.0.1:${engine.port}${path}`, {
        headers: { [ENGINE_TOKEN_HEADER]: "wrong-token-0123456789abcdef-wrong" },
      });
      expect(wrong.status).toBe(401);
      expect(await wrong.text()).toBe(missingBody);
    }

    const authorized = await fetch(`http://127.0.0.1:${engine.port}/api/vault/status`, {
      headers: { [ENGINE_TOKEN_HEADER]: "launch-secret-token-0123456789abcdef" },
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({ state: "absent" });
    expect(engine.output()).not.toContain("launch-secret-token");
  }, 60_000);

  it("invalidates a stale token after an application restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-engine-token-restart-"));
    directories.push(directory);
    const first = await startEngine({
      cwd: process.cwd(),
      env: {
        SATELLA_DATA_DIR: directory,
        SATELLA_ENGINE_TOKEN: "first-session-token-0123456789abcdef",
      },
    });
    engines.push(first);
    await waitForEngineHello(first.port);
    const unlockedWithFirst = await fetch(`http://127.0.0.1:${first.port}/api/vault/status`, {
      headers: { [ENGINE_TOKEN_HEADER]: "first-session-token-0123456789abcdef" },
    });
    expect(unlockedWithFirst.status).toBe(200);
    await first.stop();

    const second = await startEngine({
      cwd: process.cwd(),
      env: {
        SATELLA_DATA_DIR: directory,
        SATELLA_ENGINE_TOKEN: "second-session-token-0123456789abcdef",
      },
    });
    engines.push(second);
    await waitForEngineHello(second.port);

    const stale = await fetch(`http://127.0.0.1:${second.port}/api/vault/status`, {
      headers: { [ENGINE_TOKEN_HEADER]: "first-session-token-0123456789abcdef" },
    });
    expect(stale.status).toBe(401);

    const fresh = await fetch(`http://127.0.0.1:${second.port}/api/vault/status`, {
      headers: { [ENGINE_TOKEN_HEADER]: "second-session-token-0123456789abcdef" },
    });
    expect(fresh.status).toBe(200);
  }, 60_000);

  it("refuses to start without a usable session token", async () => {
    const result = await import("../database/development-database.test-utils.js").then((utils) =>
      utils.runNodeScript(utils.engineMain, [], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SATELLA_DATABASE_CONTEXT: "development",
          SATELLA_ENGINE_PORT: String(3001 + Math.floor(Math.random() * 1000)),
          SATELLA_ENGINE_TOKEN: "too-short",
        },
      }),
    );
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("SATELLA_ENGINE_TOKEN");
  }, 60_000);
});
