import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";

import { installPlaywright } from "./install-playwright.mjs";

const defaults = {
  engine: 3001,
  web: 5173,
};

const parsePort = (name, value, fallback) => {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a TCP port between 1 and 65535`);
  }
  return port;
};

const isPortAvailable = (port) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    const finish = (available) => {
      server.removeAllListeners();
      resolve(available);
    };
    server.once("error", (error) => {
      server.removeAllListeners();
      if (error?.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => finish(true));
    });
  });

const choosePort = async (envName, fallback) => {
  const requested = process.env[envName];
  const preferred = parsePort(envName, requested, fallback);
  if (requested !== undefined) {
    if (!(await isPortAvailable(preferred))) {
      throw new Error(`${envName}=${preferred} is already in use`);
    }
    return preferred;
  }

  for (let port = preferred; port <= 65_535; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting at ${preferred}`);
};

const runToCompletion = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`${command} exited from ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });

const run = async () => {
  const playwrightPath = await installPlaywright();
  const enginePort = await choosePort("SATELLA_ENGINE_PORT", defaults.engine);
  const webPort = await choosePort("SATELLA_WEB_PORT", defaults.web);
  const engineUrl = `http://127.0.0.1:${enginePort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const engineToken = process.env["SATELLA_ENGINE_TOKEN"] ?? randomBytes(32).toString("base64url");
  const env = {
    ...process.env,
    SATELLA_ENGINE_PORT: String(enginePort),
    SATELLA_DATABASE_CONTEXT: "development",
    SATELLA_ENGINE_TOKEN: engineToken,
    SATELLA_WEB_ORIGIN: webUrl,
    SATELLA_WEB_URL: webUrl,
    VITE_ENGINE_URL: engineUrl,
    VITE_ENGINE_TOKEN: engineToken,
    PLAYWRIGHT_BROWSERS_PATH: playwrightPath,
    SATELLA_PLAYWRIGHT_BROWSERS_PATH: playwrightPath,
  };
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  // Package exports point at dist. Establish a complete, topologically ordered
  // baseline before starting applications and incremental package watchers.
  await runToCompletion(pnpm, ["--filter", "./packages/connector-*", "build"], env);

  console.log(`Engine: ${engineUrl}`);
  console.log(`Web:    ${webUrl}`);

  const concurrently = process.platform === "win32" ? "concurrently.cmd" : "concurrently";
  const child = spawn(
    concurrently,
    [
      "--kill-others-on-fail",
      "pnpm --filter './packages/connector-*' --parallel dev",
      "pnpm --filter @satella-app/engine dev",
      `pnpm --filter @satella-app/web dev -- --port ${webPort} --strictPort`,
      `wait-on ${engineUrl}/api/hello ${webUrl} && pnpm --filter @satella-app/desktop dev`,
    ],
    { env, stdio: "inherit" },
  );

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`Development processes exited from ${signal}`));
      else resolve(code ?? 1);
    });
  }).then((code) => process.exit(code));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
