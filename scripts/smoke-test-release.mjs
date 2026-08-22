import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const parseArguments = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      continue;
    }
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
    throw new Error("Usage: pnpm release:smoke --artifact ./release/Satella-1.2.3-macOS-arm64.zip");
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
  throw new Error("Packaged Satella did not become ready before the smoke-test timeout");
};

const waitForStopped = async (check, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Packaged Satella did not stop its engine before the smoke-test timeout");
};

const occupyPort = async (port) => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port }, resolve);
  });
  return server;
};

const closeServer = async (server) => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
};

const waitForChildExit = async (child, timeoutMs = 5_000) => {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode ?? 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Packaged Satella second instance did not exit"));
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

const requestJson = async (url, body, token) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-satella-engine-token": token },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${await response.text()}`);
  }
};

export const smokeTestArtifact = async ({ artifact, port }) => {
  const versionMatch = basename(artifact).match(/^Satella-(.+)-macOS-arm64\.zip$/);
  if (versionMatch === null) {
    throw new Error(`Unexpected release artifact name: ${artifact}`);
  }
  if (!Number.isInteger(port) || port >= 65_535) {
    throw new Error("Smoke-test occupied port must be below 65535");
  }
  const extractionDirectory = await mkdtemp(join(tmpdir(), "satella-release-smoke-"));
  const homeDirectory = join(extractionDirectory, "home");
  const temporaryDirectory = join(extractionDirectory, "tmp");
  const redirectedDirectory = join(extractionDirectory, "redirected");
  const userDataDirectory = join(extractionDirectory, "electron-user-data");
  const appDirectory = join(extractionDirectory, "Satella.app");
  const vaultDataDirectory = join(userDataDirectory, "data");
  const preferenceMarker = join(userDataDirectory, "preferences-marker");
  const occupiedServer = await occupyPort(port);
  const engineToken = `smoke-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}token`;
  let child;
  let output = "";
  let failure;
  try {
    await mkdir(userDataDirectory, { recursive: true });
    await writeFile(preferenceMarker, "preserve");
    await execFileAsync("unzip", ["-q", artifact, "-d", extractionDirectory]);
    const executable = join(appDirectory, "Contents", "MacOS", "Satella");
    await stat(executable);

    child = spawn(executable, [`--user-data-dir=${userDataDirectory}`], {
      env: {
        ...process.env,
        HOME: homeDirectory,
        TMPDIR: temporaryDirectory,
        SATELLA_DATA_DIR: redirectedDirectory,
        SATELLA_SMOKE_ENGINE_PORT: String(port),
        SATELLA_ENGINE_TOKEN: engineToken,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    const enginePort = port + 1;
    const baseUrl = `http://127.0.0.1:${enginePort}`;
    await waitFor(async () => {
      try {
        const response = await fetch(`${baseUrl}/api/hello`);
        return response.ok;
      } catch {
        return false;
      }
    });
    const secondChild = spawn(executable, [`--user-data-dir=${userDataDirectory}`], {
      env: {
        ...process.env,
        HOME: homeDirectory,
        TMPDIR: temporaryDirectory,
      },
      stdio: "ignore",
    });
    if ((await waitForChildExit(secondChild)) !== 0) {
      throw new Error("Packaged Satella second instance exited unsuccessfully");
    }
    if (!(await fetch(`${baseUrl}/api/hello`)).ok) {
      throw new Error("Packaged Satella lost its engine after a second launch");
    }
    const unauthenticated = await fetch(`${baseUrl}/api/vault/status`);
    if (unauthenticated.status !== 401) {
      throw new Error(
        `Unauthenticated privileged request was not rejected (HTTP ${unauthenticated.status})`,
      );
    }
    await requestJson(
      `${baseUrl}/api/vault/initialize`,
      {
        password: "smoke-test-password",
        pin: "0000",
      },
      engineToken,
    );
    const exportPath = join(extractionDirectory, "smoke.satella-vault");
    await requestJson(
      `${baseUrl}/api/vault/export`,
      {
        password: "smoke-test-password",
        destinationPath: exportPath,
      },
      engineToken,
    );
    if (!(await pathExists(exportPath))) {
      throw new Error("Vault export did not produce a recovery file");
    }
    await requestJson(`${baseUrl}/api/vault/close`, {}, engineToken);
    await requestJson(
      `${baseUrl}/api/vault/restore`,
      {
        sourcePath: exportPath,
        password: "smoke-test-password",
      },
      engineToken,
    );
    await requestJson(
      `${baseUrl}/api/vault/unlock`,
      {
        password: "smoke-test-password",
      },
      engineToken,
    );
    if (
      !(await pathExists(join(vaultDataDirectory, "vault.envelope.json"))) ||
      !(await pathExists(join(vaultDataDirectory, "satella.sqlite")))
    ) {
      throw new Error("Packaged Vault files were not created under userData/data");
    }
    await requestJson(`${baseUrl}/api/vault/reset`, { confirmation: "Reset Satella" }, engineToken);
    if (
      (await pathExists(join(vaultDataDirectory, "vault.envelope.json"))) ||
      (await pathExists(join(vaultDataDirectory, "satella.sqlite")))
    ) {
      throw new Error("Packaged Vault reset left encrypted Vault files behind");
    }
    if (!(await pathExists(preferenceMarker))) {
      throw new Error("Packaged Vault reset removed a non-Vault preference");
    }
    if (await pathExists(redirectedDirectory)) {
      throw new Error("Packaged startup honored an inherited Vault data-directory override");
    }
  } catch (error) {
    failure = new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`);
  }
  if (child !== undefined && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  if (child !== undefined) {
    try {
      await waitForStopped(async () => {
        try {
          return !(await fetch(`http://127.0.0.1:${port + 1}/api/hello`)).ok;
        } catch {
          return true;
        }
      });
      if (await pathExists(join(vaultDataDirectory, "engine.lock"))) {
        failure ??= new Error("Packaged engine ownership was not released during smoke cleanup");
      }
    } catch (error) {
      failure ??= error;
    }
  }
  try {
    await closeServer(occupiedServer);
  } finally {
    await rm(extractionDirectory, { recursive: true, force: true });
  }
  if (failure !== undefined) throw failure;
};

if (process.argv[1]?.endsWith("smoke-test-release.mjs")) {
  smokeTestArtifact(parseArguments(process.argv.slice(2)))
    .then(() => console.log("Packaged runtime smoke test passed."))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
