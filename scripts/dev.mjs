import { spawn } from "node:child_process";
import { createServer } from "node:net";

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
  const enginePort = await choosePort("OPTIMUS_ENGINE_PORT", defaults.engine);
  const webPort = await choosePort("OPTIMUS_WEB_PORT", defaults.web);
  const engineUrl = `http://127.0.0.1:${enginePort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const env = {
    ...process.env,
    OPTIMUS_ENGINE_PORT: String(enginePort),
    OPTIMUS_WEB_ORIGIN: webUrl,
    OPTIMUS_WEB_URL: webUrl,
    VITE_ENGINE_URL: engineUrl,
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
      "pnpm --filter @optimus/engine dev",
      `pnpm --filter @optimus/web dev -- --port ${webPort} --strictPort`,
      `wait-on ${engineUrl}/api/hello ${webUrl} && pnpm --filter @optimus/desktop dev`,
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
