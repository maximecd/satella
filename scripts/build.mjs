import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { installPlaywright } from "./install-playwright.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const run = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`${command} exited from ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });

const main = async () => {
  const browsersPath = await installPlaywright({ root: repositoryRoot });
  const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    SATELLA_PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  };
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  // Build workspace dependencies before the engine. The engine bundles the
  // connector packages from their emitted dist files, so a flat recursive
  // build can race and resolve a package while its dist directory is being
  // cleaned.
  await run(pnpm, ["--filter", "@satella-app/engine...", "run", "build"], env);
  await run(pnpm, ["--filter", "@satella-app/desktop", "run", "build"], env);
  await run(pnpm, ["--filter", "@satella-app/web", "run", "build"], env);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
