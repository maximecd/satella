import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const PASSWORD = "correct-horse-battery";
const PIN = "1357";
const MARKER = "SATELLA_EXPORT_MARKER_51ab2c";
const POST_EXPORT_MARKER = "SATELLA_POST_EXPORT_MARKER_c3d917";

let activeToken = "";

const json = async (port: number, path: string, init: RequestInit = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-satella-engine-token": activeToken,
      ...init.headers,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length === 0 ? undefined : JSON.parse(text),
  };
};

const addMarkerAsset = async (port: number, name: string) => {
  const created = await json(port, "/api/add-assets/other", {
    method: "POST",
    body: JSON.stringify({ name, value: "1", currencyAssetId: "fiat:USD" }),
  });
  expect(created.status).toBe(201);
};

describe("Vault export and restore", () => {
  const directories: string[] = [];
  const engines: Array<Awaited<ReturnType<typeof startEngine>>> = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const start = async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-vault-transfer-"));
    directories.push(directory);
    const engine = await startEngine({
      cwd: process.cwd(),
      env: { SATELLA_DATA_DIR: directory },
    });
    engines.push(engine);
    activeToken = engine.token;
    await waitForEngineHello(engine.port);
    return { directory, engine };
  };

  it("exports an encrypted container and restores it over a changed Vault", async () => {
    const { directory, engine } = await start();
    const { port } = engine;
    expect(
      (
        await json(port, "/api/vault/initialize", {
          method: "POST",
          body: JSON.stringify({ password: PASSWORD, pin: PIN }),
        })
      ).status,
    ).toBeLessThan(300);

    await addMarkerAsset(port, MARKER);
    const timeout = await json(port, "/api/vault/screen-lock-timeout", {
      method: "PATCH",
      body: JSON.stringify({ minutes: 30 }),
    });
    expect(timeout.status).toBeLessThan(300);

    const exportPath = join(directory, "recovery.satella-vault");
    const wrongPassword = await json(port, "/api/vault/export", {
      method: "POST",
      body: JSON.stringify({ password: "not-the-password-x", destinationPath: exportPath }),
    });
    expect(wrongPassword.status).toBeGreaterThanOrEqual(400);
    await expect(readFile(exportPath)).rejects.toThrow(/ENOENT/);

    const exported = await json(port, "/api/vault/export", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD, destinationPath: exportPath }),
    });
    expect(exported.status).toBeLessThan(300);
    const exportedBytes = await readFile(exportPath);
    expect(exportedBytes.subarray(0, 4).toString("utf8")).toBe("SVLT");
    expect(exportedBytes.includes(Buffer.from(MARKER))).toBe(false);
    expect(exportedBytes.includes(Buffer.from(PASSWORD))).toBe(false);

    await addMarkerAsset(port, POST_EXPORT_MARKER);

    const openRestore = await json(port, "/api/vault/restore", {
      method: "POST",
      body: JSON.stringify({ sourcePath: exportPath, password: PASSWORD }),
    });
    expect(openRestore.body).toMatchObject({ code: "vault-open" });

    await json(port, "/api/vault/close", { method: "POST" });

    const badPassword = await json(port, "/api/vault/restore", {
      method: "POST",
      body: JSON.stringify({ sourcePath: exportPath, password: "wrong-password-1" }),
    });
    expect(badPassword.status).toBeGreaterThanOrEqual(400);

    const unlockedOriginal = await json(port, "/api/vault/unlock", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(unlockedOriginal.body).toMatchObject({ state: "open" });
    const dashboardBefore = await json(port, "/api/dashboard");
    expect(JSON.stringify(dashboardBefore.body)).toContain(POST_EXPORT_MARKER);
    await json(port, "/api/vault/close", { method: "POST" });

    const restored = await json(port, "/api/vault/restore", {
      method: "POST",
      body: JSON.stringify({ sourcePath: exportPath, password: PASSWORD }),
    });
    expect(restored.status).toBeLessThan(300);
    expect(restored.body).toEqual({ state: "locked" });

    const unlocked = await json(port, "/api/vault/unlock", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(unlocked.body).toMatchObject({
      state: "open",
      screenLockTimeoutMinutes: 30,
    });

    const dashboard = await json(port, "/api/dashboard");
    const rendered = JSON.stringify(dashboard.body);
    expect(rendered).toContain(MARKER);
    expect(rendered).not.toContain(POST_EXPORT_MARKER);

    await json(port, "/api/vault/lock", { method: "POST" });
    const dismissed = await json(port, "/api/vault/unlock-screen", {
      method: "POST",
      body: JSON.stringify({ pin: PIN }),
    });
    expect(dismissed.body).toMatchObject({ screenLock: false });
  }, 120_000);

  describe("rejected restores leave the current Vault usable", () => {
    const preparePopulatedVaultAndExport = async () => {
      const { directory, engine } = await start();
      const { port } = engine;
      await json(port, "/api/vault/initialize", {
        method: "POST",
        body: JSON.stringify({ password: PASSWORD, pin: PIN }),
      });
      await addMarkerAsset(port, MARKER);
      const exportPath = join(directory, "valid.satella-vault");
      const exported = await json(port, "/api/vault/export", {
        method: "POST",
        body: JSON.stringify({ password: PASSWORD, destinationPath: exportPath }),
      });
      expect(exported.status).toBeLessThan(300);
      await addMarkerAsset(port, POST_EXPORT_MARKER);
      await json(port, "/api/vault/close", { method: "POST" });
      return { directory, port, exportPath };
    };

    const expectVaultStillOpens = async (port: number) => {
      const unlocked = await json(port, "/api/vault/unlock", {
        method: "POST",
        body: JSON.stringify({ password: PASSWORD }),
      });
      expect(unlocked.body).toMatchObject({ state: "open" });
      const dashboard = await json(port, "/api/dashboard");
      expect(JSON.stringify(dashboard.body)).toContain(MARKER);
      expect(JSON.stringify(dashboard.body)).toContain(POST_EXPORT_MARKER);
      await json(port, "/api/vault/close", { method: "POST" });
    };

    it("rejects a malformed file without touching the Vault", async () => {
      const { directory, port, exportPath } = await preparePopulatedVaultAndExport();
      const malformedPath = join(directory, "malformed.satella-vault");
      await writeFile(malformedPath, Buffer.from("definitely not a vault container"));
      const rejected = await json(port, "/api/vault/restore", {
        method: "POST",
        body: JSON.stringify({ sourcePath: malformedPath, password: PASSWORD }),
      });
      expect(rejected.body).toMatchObject({ code: "invalid-container" });
      void exportPath;
      await expectVaultStillOpens(port);
    }, 120_000);

    it("rejects a truncated database without touching the Vault", async () => {
      const { directory, port, exportPath } = await preparePopulatedVaultAndExport();
      const bytes = await readFile(exportPath);
      const truncatedPath = join(directory, "truncated.satella-vault");
      await writeFile(truncatedPath, bytes.subarray(0, Math.max(1, bytes.byteLength - 2048)));
      const rejected = await json(port, "/api/vault/restore", {
        method: "POST",
        body: JSON.stringify({ sourcePath: truncatedPath, password: PASSWORD }),
      });
      expect(rejected.body).toMatchObject({ code: "invalid-container" });
      await expectVaultStillOpens(port);
    }, 120_000);

    it("rejects a newer container format without touching the Vault", async () => {
      const { directory, port, exportPath } = await preparePopulatedVaultAndExport();
      const bytes = await readFile(exportPath);
      bytes[4] = 2;
      const newerPath = join(directory, "newer.satella-vault");
      await writeFile(newerPath, bytes);
      const rejected = await json(port, "/api/vault/restore", {
        method: "POST",
        body: JSON.stringify({ sourcePath: newerPath, password: PASSWORD }),
      });
      expect(rejected.body).toMatchObject({ code: "unsupported-container" });
      await expectVaultStillOpens(port);
    }, 120_000);

    it("leaves no partial export when the destination cannot be written", async () => {
      const { engine } = await start();
      const port = engine.port;
      await json(port, "/api/vault/initialize", {
        method: "POST",
        body: JSON.stringify({ password: PASSWORD, pin: PIN }),
      });
      const missingDirectory = "/nonexistent/satella-export-directory";
      const failed = await json(port, "/api/vault/export", {
        method: "POST",
        body: JSON.stringify({ password: PASSWORD, destinationPath: missingDirectory }),
      });
      expect(failed.status).toBeGreaterThanOrEqual(400);
      await expect(readFile(missingDirectory)).rejects.toThrow(/ENOENT/);
    }, 120_000);
  });
});
