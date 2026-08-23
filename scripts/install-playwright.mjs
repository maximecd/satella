import { execFile } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const playwrightBrowsersPath = (root = repositoryRoot) =>
  resolve(root, process.env["SATELLA_PLAYWRIGHT_BROWSERS_PATH"] ?? ".playwright");

const installedBrowserExecutables = async (browsersPath) => {
  let entries;
  try {
    entries = await readdir(browsersPath, { withFileTypes: true });
  } catch {
    return { chromium: undefined, headlessShell: undefined };
  }
  let chromium;
  let headlessShell;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidates = entry.name.startsWith("chromium_headless_shell-")
      ? [
          join(browsersPath, entry.name, "chrome-mac", "headless_shell"),
          join(browsersPath, entry.name, "chrome-linux", "headless_shell"),
          join(browsersPath, entry.name, "chrome-win", "headless_shell.exe"),
        ]
      : entry.name.startsWith("chromium-")
        ? [
            join(
              browsersPath,
              entry.name,
              "chrome-mac",
              "Chromium.app",
              "Contents",
              "MacOS",
              "Chromium",
            ),
            join(browsersPath, entry.name, "chrome-linux", "chrome"),
            join(browsersPath, entry.name, "chrome-win", "chrome.exe"),
          ]
        : [];
    for (const candidate of candidates) {
      try {
        const info = await stat(candidate);
        if (info.isFile()) {
          if (entry.name.startsWith("chromium_headless_shell-")) headlessShell = candidate;
          else chromium = candidate;
          break;
        }
      } catch {
        // Try the next platform-specific executable layout.
      }
    }
  }
  return { chromium, headlessShell };
};

/** Installs the exact Chromium revision required by the engine's Playwright package. */
export const installPlaywright = async ({ root = repositoryRoot } = {}) => {
  const browsersPath = playwrightBrowsersPath(root);
  await mkdir(browsersPath, { recursive: true });
  const existing = await installedBrowserExecutables(browsersPath);
  if (existing.chromium !== undefined && existing.headlessShell !== undefined) return browsersPath;
  const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    SATELLA_PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  };
  delete env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await execFileAsync(
    pnpm,
    ["--filter", "@satella-app/engine", "exec", "playwright", "install", "chromium"],
    {
      cwd: root,
      env,
      maxBuffer: 100 * 1024 * 1024,
    },
  );
  return browsersPath;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  installPlaywright()
    .then((path) => console.log(`Playwright Chromium installed in ${path}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
