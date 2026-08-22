import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";

export const DEFAULT_ENGINE_PORT = 3001;
export const ENGINE_TOKEN_HEADER = "x-satella-engine-token";

export const newEngineToken = () => randomBytes(32).toString("base64url");

const parsePort = (name: string, value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a TCP port between 1 and 65535`);
  }
  return port;
};

const isPortAvailable = (port: number) =>
  new Promise<boolean>((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      server.close();
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });

export const chooseAvailableEnginePort = async (
  preferred = DEFAULT_ENGINE_PORT,
  isAvailable: (port: number) => Promise<boolean> = isPortAvailable,
) => {
  for (let port = preferred; port <= 65_535; port += 1) {
    if (await isAvailable(port)) return port;
  }
  throw new Error(`No available engine port found starting at ${preferred}`);
};

export const enginePortForDevelopment = (
  env: NodeJS.ProcessEnv = process.env,
  fallback = DEFAULT_ENGINE_PORT,
) => parsePort("SATELLA_ENGINE_PORT", env["SATELLA_ENGINE_PORT"], fallback);

export const managedEngineCommand = (
  developmentUrl: string | undefined,
  moduleDir = __dirname,
  options: {
    readonly isPackaged?: boolean;
    readonly resourcesPath?: string;
  } = {},
): { readonly command: string; readonly args: ReadonlyArray<string> } | undefined => {
  if (developmentUrl !== undefined) return undefined;
  const enginePath =
    options.isPackaged === true && options.resourcesPath !== undefined
      ? join(options.resourcesPath, "engine", "dist", "main.mjs")
      : join(moduleDir, "../../engine/dist/main.mjs");
  return {
    command: process.execPath,
    args: [enginePath],
  };
};

export const screenLockRequest = (engineUrl: string, token: string) => ({
  url: `${engineUrl.replace(/\/$/, "")}/api/vault/lock`,
  method: "POST" as const,
  headers: { [ENGINE_TOKEN_HEADER]: token },
});

export const managedEngineEnvironment = (
  env: NodeJS.ProcessEnv,
  options: {
    readonly port: number;
    readonly dataDirectory: string;
    readonly logDirectory?: string;
    readonly parentPid?: number;
    readonly production?: boolean;
    readonly engineToken?: string;
  },
): NodeJS.ProcessEnv => {
  const managedEnvironment = {
    ...env,
    ELECTRON_RUN_AS_NODE: "1",
    SATELLA_ENGINE_PORT: String(options.port),
    SATELLA_DATA_DIR: options.dataDirectory,
  };
  if (options.engineToken !== undefined) {
    Object.assign(managedEnvironment, { SATELLA_ENGINE_TOKEN: options.engineToken });
  }
  if (options.logDirectory !== undefined) {
    Object.assign(managedEnvironment, { SATELLA_LOG_DIR: options.logDirectory });
  }
  if (options.parentPid !== undefined) {
    Object.assign(managedEnvironment, {
      SATELLA_ENGINE_PARENT_PID: String(options.parentPid),
    });
  }
  if (options.production === true) {
    Object.assign(managedEnvironment, {
      SATELLA_CANONICAL_DATA_DIR: options.dataDirectory,
      SATELLA_DATABASE_CONTEXT: "production",
    });
  }
  return managedEnvironment;
};

export const waitForEngineHello = async (
  port: number,
  fetchImpl: typeof fetch = fetch,
  attempts = 40,
) => {
  const url = `http://127.0.0.1:${port}/api/hello`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) return;
    } catch {
      // Engine is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Managed engine did not become ready");
};

export const stopManagedEngine = async (child: ChildProcess | undefined) => {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
};

export const spawnManagedEngine = (
  command: { readonly command: string; readonly args: ReadonlyArray<string> },
  env: NodeJS.ProcessEnv,
) => spawn(command.command, [...command.args], { env, stdio: ["ignore", "pipe", "pipe"] });
