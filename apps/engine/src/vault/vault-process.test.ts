import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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

const MARKER = "OPTIMUS_VAULT_MARKER_9f3c1a";
const PASSWORD = "correct-horse-battery";
const NEXT_PASSWORD = "new-horse-battery-x";
const PIN = "2468";

const collectFiles = async (directory: string): Promise<ReadonlyArray<string>> => {
  const names = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of names) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else files.push(path);
  }
  return files;
};

const filesContainMarker = async (directory: string) => {
  const files = await collectFiles(directory);
  for (const path of files) {
    const bytes = await readFile(path);
    if (bytes.includes(Buffer.from(MARKER))) return true;
  }
  return false;
};

const json = async (port: number, path: string, init: RequestInit = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length === 0 ? undefined : JSON.parse(text),
  };
};

describe("engine Vault process", () => {
  const directories: string[] = [];
  const engines: Array<Awaited<ReturnType<typeof startEngine>>> = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const start = async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-vault-process-"));
    directories.push(directory);
    const engine = await startEngine({
      cwd: process.cwd(),
      env: { OPTIMUS_DATA_DIR: directory },
    });
    engines.push(engine);
    await waitForEngineHello(engine.port);
    return { directory, engine };
  };

  it("initializes, locks finance until unlock, hides markers at rest, and resets", async () => {
    const { directory, engine } = await start();
    const { port } = engine;
    expect((await json(port, "/api/vault/status")).body).toEqual({ state: "absent" });
    expect((await json(port, "/api/dashboard")).status).toBe(403);

    const initialized = await json(port, "/api/vault/initialize", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD, pin: PIN }),
    });
    expect(initialized.status).toBeLessThan(300);
    expect(initialized.body).toMatchObject({ state: "open", screenLock: false });

    const created = await json(port, "/api/add-assets/other", {
      method: "POST",
      body: JSON.stringify({
        name: MARKER,
        value: "1",
        currencyAssetId: "fiat:USD",
      }),
    });
    expect(created.status).toBe(201);

    await json(port, "/api/vault/lock", { method: "POST" });
    expect((await json(port, "/api/dashboard")).status).toBe(403);
    expect((await json(port, "/api/vault/status")).body).toMatchObject({
      state: "open",
      screenLock: true,
    });

    const wrongPin = await json(port, "/api/vault/unlock-screen", {
      method: "POST",
      body: JSON.stringify({ pin: "0000" }),
    });
    expect(wrongPin.status).toBeGreaterThanOrEqual(400);
    await json(port, "/api/vault/unlock-screen", {
      method: "POST",
      body: JSON.stringify({ pin: "0000" }),
    });
    await json(port, "/api/vault/unlock-screen", {
      method: "POST",
      body: JSON.stringify({ pin: "0000" }),
    });
    expect((await json(port, "/api/vault/status")).body).toMatchObject({ pinEntryDisabled: true });

    const fallback = await json(port, "/api/vault/unlock-screen-with-password", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(fallback.body).toMatchObject({ screenLock: false, pinEntryDisabled: false });

    await json(port, "/api/vault/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: PASSWORD, nextPassword: NEXT_PASSWORD }),
    });
    await json(port, "/api/vault/close", { method: "POST" });
    expect(await filesContainMarker(directory)).toBe(false);
    expect((await json(port, "/api/dashboard")).status).toBe(403);

    const wrong = await json(port, "/api/vault/unlock", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(wrong.body)).toContain("could not be unlocked");

    const unlocked = await json(port, "/api/vault/unlock", {
      method: "POST",
      body: JSON.stringify({ password: NEXT_PASSWORD }),
    });
    expect(unlocked.body).toMatchObject({ state: "open" });
    const dashboard = await json(port, "/api/dashboard");
    expect(dashboard.status).toBe(200);
    expect(JSON.stringify(dashboard.body)).toContain(MARKER);
    expect(engine.output()).not.toContain(PASSWORD);
    expect(engine.output()).not.toContain(NEXT_PASSWORD);
    expect(engine.output()).not.toContain(PIN);

    await engine.stop();
    const restarted = await startEngine({
      cwd: process.cwd(),
      env: { OPTIMUS_DATA_DIR: directory },
    });
    engines.push(restarted);
    await waitForEngineHello(restarted.port);
    expect((await json(restarted.port, "/api/vault/status")).body).toEqual({ state: "locked" });
    expect((await json(restarted.port, "/api/dashboard")).status).toBe(403);

    await json(restarted.port, "/api/vault/unlock", {
      method: "POST",
      body: JSON.stringify({ password: NEXT_PASSWORD }),
    });
    await json(restarted.port, "/api/vault/reset", {
      method: "POST",
      body: JSON.stringify({ confirmation: "Reset Optimus" }),
    });
    expect((await json(restarted.port, "/api/vault/status")).body).toEqual({ state: "absent" });
    const remaining = await collectFiles(directory);
    expect(remaining.some((path) => path.endsWith("optimus.sqlite"))).toBe(false);
    expect(remaining.some((path) => path.endsWith("vault.envelope.json"))).toBe(false);
  }, 90_000);
});
