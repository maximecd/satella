import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const parseArguments = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--artifact" || argument === "--port") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      values[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith("--artifact=")) {
      values.artifact = argument.slice("--artifact=".length);
    } else if (argument.startsWith("--port=")) {
      values.port = argument.slice("--port=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (values.artifact === undefined) {
    throw new Error("Usage: pnpm release:smoke --artifact ./release/satella-app-1.2.3.tgz");
  }
  const port = Number(values.port ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port >= 65_535) {
    throw new Error("--port must be a TCP port between 1 and 65534");
  }
  return { artifact: values.artifact, port };
};

const waitFor = async (check, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Packed Satella did not become ready before the smoke-test timeout");
};

const waitForStopped = async (check, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Packed Satella did not stop before the smoke-test timeout");
};

const waitForChildExit = async (child, timeoutMs = 8_000) => {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode ?? 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Packed Satella second instance did not exit"));
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });
};

const pathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const requestJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return text.length === 0 ? undefined : JSON.parse(text);
};

const spawnCli = (bin, env) => {
  const child = spawn(process.execPath, [bin], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
};

export const smokeTestArtifact = async ({ artifact, port }) => {
  const versionMatch = basename(artifact).match(/^satella-app-(.+)\.tgz$/);
  if (versionMatch === null) {
    throw new Error(`Unexpected release artifact name: ${artifact}`);
  }
  const extractionDirectory = await mkdtemp(join(tmpdir(), "satella-release-smoke-"));
  const prefix = join(extractionDirectory, "prefix");
  const dataDirectory = join(extractionDirectory, "vault");
  let launched;
  let failure;
  try {
    await mkdir(prefix, { recursive: true });
    await execFileAsync("npm", ["install", "--prefix", prefix, artifact], {
      maxBuffer: 50 * 1024 * 1024,
    });
    const bin = join(prefix, "node_modules", "@satella", "app", "bin", "satella.mjs");
    await stat(bin);

    const env = {
      ...process.env,
      SATELLA_DATA_DIR: dataDirectory,
      SATELLA_ENGINE_PORT: String(port),
      SATELLA_OPEN_BROWSER: "0",
      SATELLA_VAULT_KDF: "fast",
    };
    delete env.SATELLA_DATABASE_CONTEXT;
    delete env.SATELLA_ENGINE_TOKEN;

    launched = spawnCli(bin, env);
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitFor(async () => {
      try {
        const hello = await fetch(`${baseUrl}/api/hello`);
        const ui = await fetch(`${baseUrl}/`);
        return hello.ok && ui.ok;
      } catch {
        return false;
      }
    });
    const helloBody = await (await fetch(`${baseUrl}/api/hello`)).json();
    if (helloBody.message !== "Hello world") {
      throw new Error("Packed /api/hello did not return the Satella health payload");
    }
    const ui = await (await fetch(`${baseUrl}/`)).text();
    if (!ui.toLowerCase().includes("satella") && !ui.includes("<div")) {
      throw new Error("Packed / did not serve the web UI");
    }
    const unauthenticated = await fetch(`${baseUrl}/api/vault/status`);
    if (unauthenticated.status !== 200) {
      throw new Error(`Loopback Vault status was rejected (HTTP ${unauthenticated.status})`);
    }

    const second = spawnCli(bin, env);
    if ((await waitForChildExit(second.child)) !== 0) {
      throw new Error(`Packed Satella second instance exited unsuccessfully\n${second.output()}`);
    }
    if (!(await fetch(`${baseUrl}/api/hello`)).ok) {
      throw new Error("Packed Satella lost its engine after a second launch");
    }

    await requestJson(`${baseUrl}/api/vault/initialize`, {
      password: "smoke-test-password",
      pin: "0000",
    });
    const sqlitePath = join(dataDirectory, "satella.sqlite");
    const envelopePath = join(dataDirectory, "vault.envelope.json");
    if (!(await pathExists(sqlitePath)) || !(await pathExists(envelopePath))) {
      throw new Error("Packed Vault files were not created under the injected data directory");
    }
    const sqliteHeader = Buffer.alloc(16);
    const handle = await import("node:fs/promises").then((fs) => fs.open(sqlitePath, "r"));
    try {
      await handle.read(sqliteHeader, 0, 16, 0);
    } finally {
      await handle.close();
    }
    if (sqliteHeader.toString("utf8").startsWith("SQLite format 3")) {
      throw new Error("Packed Vault database was stored as plaintext SQLite");
    }

    const exported = await requestJson(`${baseUrl}/api/vault/export-download`, {
      password: "smoke-test-password",
    });
    const contentsBase64 = exported?.contentsBase64 ?? "";
    if (contentsBase64.length === 0) {
      throw new Error("Vault export download did not return ciphertext");
    }
    await requestJson(`${baseUrl}/api/vault/close`, {});
    await requestJson(`${baseUrl}/api/vault/restore-upload`, {
      password: "smoke-test-password",
      contentsBase64,
    });
    await requestJson(`${baseUrl}/api/vault/unlock`, { password: "smoke-test-password" });
    await requestJson(`${baseUrl}/api/vault/reset`, { confirmation: "Reset Satella" });
    if ((await pathExists(sqlitePath)) || (await pathExists(envelopePath))) {
      throw new Error("Packed Vault reset left encrypted Vault files behind");
    }
  } catch (error) {
    failure = new Error(
      `${error instanceof Error ? error.message : String(error)}\n${launched?.output() ?? ""}`,
    );
  }
  if (
    launched !== undefined &&
    launched.child.exitCode === null &&
    launched.child.signalCode === null
  ) {
    launched.child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        launched.child.kill("SIGKILL");
        resolve();
      }, 5_000);
      launched.child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  if (launched !== undefined) {
    try {
      await waitForStopped(async () => {
        try {
          return !(await fetch(`http://127.0.0.1:${port}/api/hello`)).ok;
        } catch {
          return true;
        }
      });
    } catch (error) {
      failure ??= error;
    }
  }
  await rm(extractionDirectory, { recursive: true, force: true });
  if (failure !== undefined) throw failure;
};

if (process.argv[1]?.endsWith("smoke-test-release.mjs")) {
  smokeTestArtifact(parseArguments(process.argv.slice(2)))
    .then(() => console.log("Packed runtime smoke test passed."))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
