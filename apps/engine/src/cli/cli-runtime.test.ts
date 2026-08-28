import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  chooseFreePort,
  commandEnv,
  engineMain,
  runNodeScript,
  startEngine,
} from "../database/development-database.test-utils.js";

const waitForUrl = async (url: string, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const occupyPort = async (port: number) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("not satella");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port }, () => resolve());
  });
  return server;
};

describe("product CLI runtime", () => {
  const directories: string[] = [];
  const engines: Array<Awaited<ReturnType<typeof startEngine>>> = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const startCli = async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-cli-runtime-"));
    directories.push(directory);
    const webDir = join(directory, "web");
    await mkdir(webDir);
    await writeFile(
      join(webDir, "index.html"),
      "<!doctype html><title>Satella CLI</title><p>cli-ui-marker</p>",
    );
    const engine = await startEngine({
      cwd: process.cwd(),
      env: {
        SATELLA_DATA_DIR: directory,
        SATELLA_WEB_DIR: webDir,
        SATELLA_OPEN_BROWSER: "0",
        SATELLA_DATABASE_CONTEXT: "production",
      },
    });
    engines.push(engine);
    await waitForUrl(`http://127.0.0.1:${engine.port}/api/hello`);
    return { directory, engine, webDir };
  };

  it("serves the UI and API on the same origin without a token", async () => {
    const { engine } = await startCli();
    const hello = await fetch(`http://127.0.0.1:${engine.port}/api/hello`);
    expect(hello.status).toBe(200);
    expect(await hello.json()).toEqual({ message: "Hello world" });

    const ui = await fetch(`http://127.0.0.1:${engine.port}/`);
    expect(ui.status).toBe(200);
    expect(await ui.text()).toContain("cli-ui-marker");

    const status = await fetch(`http://127.0.0.1:${engine.port}/api/vault/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ state: "absent" });
  }, 60_000);

  it("reopens an existing instance and exits 0 instead of taking the port", async () => {
    const { directory, engine } = await startCli();
    const second = await runNodeScript(engineMain, [], {
      cwd: process.cwd(),
      env: commandEnv({
        SATELLA_DATA_DIR: directory,
        SATELLA_ENGINE_PORT: String(engine.port),
        SATELLA_OPEN_BROWSER: "0",
        SATELLA_DATABASE_CONTEXT: "production",
      }),
    });
    expect(second.code).toBe(0);
    const hello = await fetch(`http://127.0.0.1:${engine.port}/api/hello`);
    expect(hello.status).toBe(200);
  }, 60_000);

  it("fails when the listen port is taken by something else", async () => {
    const port = await chooseFreePort();
    const occupant = await occupyPort(port);
    try {
      const directory = await mkdtemp(join(tmpdir(), "satella-cli-port-taken-"));
      directories.push(directory);
      const result = await runNodeScript(engineMain, [], {
        cwd: process.cwd(),
        env: commandEnv({
          SATELLA_DATA_DIR: directory,
          SATELLA_ENGINE_PORT: String(port),
          SATELLA_OPEN_BROWSER: "0",
          SATELLA_DATABASE_CONTEXT: "production",
        }),
      });
      expect(result.code).not.toBe(0);
      expect(result.output).toMatch(/not Satella|EADDRINUSE|already in use/i);
    } finally {
      await new Promise<void>((resolve, reject) => {
        occupant.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    }
  }, 60_000);
});
