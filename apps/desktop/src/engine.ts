import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export const managedEngineCommand = (
  developmentUrl: string | undefined,
  moduleDir = __dirname,
): { readonly command: string; readonly args: ReadonlyArray<string> } | undefined => {
  if (developmentUrl !== undefined) return undefined;
  return {
    command: process.execPath,
    args: [join(moduleDir, "../../engine/dist/main.mjs")],
  };
};

export const screenLockRequest = (engineUrl: string) => ({
  url: `${engineUrl.replace(/\/$/, "")}/api/vault/lock`,
  method: "POST" as const,
});

export const managedEngineEnvironment = (
  env: NodeJS.ProcessEnv,
  options: { readonly port: number; readonly dataDirectory: string },
): NodeJS.ProcessEnv => ({
  ...env,
  OPTIMUS_ENGINE_PORT: String(options.port),
  OPTIMUS_DATA_DIR: env["OPTIMUS_DATA_DIR"] ?? options.dataDirectory,
});

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
