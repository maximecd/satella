import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

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

describe("loopback API access", () => {
  const directories: string[] = [];
  const engines: Array<Awaited<ReturnType<typeof startEngine>>> = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const start = async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-loopback-api-"));
    directories.push(directory);
    const engine = await startEngine({
      cwd: process.cwd(),
      env: { SATELLA_DATA_DIR: directory },
    });
    engines.push(engine);
    await waitForEngineHello(engine.port);
    return engine;
  };

  it("serves health and Vault status without an engine token", async () => {
    const engine = await start();
    const hello = await fetch(`http://127.0.0.1:${engine.port}/api/hello`);
    expect(hello.status).toBe(200);
    expect(await hello.json()).toEqual({ message: "Hello world" });

    const status = await fetch(`http://127.0.0.1:${engine.port}/api/vault/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ state: "absent" });
  }, 60_000);

  it("starts without SATELLA_ENGINE_TOKEN", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-loopback-no-token-"));
    directories.push(directory);
    const engine = await startEngine({
      cwd: process.cwd(),
      env: { SATELLA_DATA_DIR: directory, SATELLA_ENGINE_TOKEN: undefined },
    });
    engines.push(engine);
    await waitForEngineHello(engine.port);
    const status = await fetch(`http://127.0.0.1:${engine.port}/api/vault/status`);
    expect(status.status).toBe(200);
  }, 60_000);
});
