import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const engineRoot = fileURLToPath(new URL("..", import.meta.url));
const tsx = process.platform === "win32" ? "tsx.cmd" : "tsx";
const nodeOptions = [process.env["NODE_OPTIONS"], "--conditions=development"]
  .filter((value) => value !== undefined && value.length > 0)
  .join(" ");

const child = spawn(
  tsx,
  ["watch", "--include", "../../packages/connector-*/dist/**/*", "src/main.ts"],
  {
    cwd: engineRoot,
    env: { ...process.env, NODE_OPTIONS: nodeOptions, OPTIMUS_DATABASE_CONTEXT: "development" },
    stdio: "inherit",
  },
);

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
