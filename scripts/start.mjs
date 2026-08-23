import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const browsersPath =
  process.env["SATELLA_PLAYWRIGHT_BROWSERS_PATH"] ?? join(repositoryRoot, ".playwright");
const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  SATELLA_PLAYWRIGHT_BROWSERS_PATH: browsersPath,
};
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`${command} exited from ${signal}`));
      else if (code !== 0) reject(new Error(`${command} exited with code ${code ?? 1}`));
      else resolve();
    });
  });

const main = async () => {
  await run(pnpm, ["run", "build"]);
  const concurrently = process.platform === "win32" ? "concurrently.cmd" : "concurrently";
  const child = spawn(
    concurrently,
    [
      "--kill-others-on-fail",
      "pnpm --filter @satella-app/engine start",
      "wait-on http://127.0.0.1:3001/api/hello && pnpm --filter @satella-app/desktop start",
    ],
    { cwd: repositoryRoot, env, stdio: "inherit" },
  );
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`start processes exited from ${signal}`));
      else resolve(code ?? 1);
    });
  }).then((code) => process.exit(code));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
