import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const child = spawn(
  process.execPath,
  [join(repositoryRoot, "apps", "engine", "dist", "main.mjs")],
  {
    env: {
      ...process.env,
      SATELLA_WEB_DIR:
        process.env["SATELLA_WEB_DIR"] ?? join(repositoryRoot, "apps", "web", "dist"),
    },
    stdio: "inherit",
  },
);

child.once("exit", (code, signal) => {
  if (signal !== null) process.exit(1);
  process.exit(code ?? 1);
});
