import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const engineRoot = fileURLToPath(new URL("..", import.meta.url));
const playwrightPath =
  process.env["SATELLA_PLAYWRIGHT_BROWSERS_PATH"] ??
  fileURLToPath(new URL("../../../.playwright", import.meta.url));
const child = spawn(process.execPath, ["dist/main.mjs"], {
  cwd: engineRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: playwrightPath,
    SATELLA_PLAYWRIGHT_BROWSERS_PATH: playwrightPath,
  },
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal !== null) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
