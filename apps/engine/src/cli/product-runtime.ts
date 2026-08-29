import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpServerResponse } from "effect/unstable/http";

export const HELLO_MESSAGE = "Hello world";

const HelloBody = Schema.Struct({ message: Schema.Literal(HELLO_MESSAGE) });

const BANNER_ROWS = [
  " ____        _          _  _       ",
  "/ ___|  __ _ | |_   ___ | || |  __ _ ",
  "\\___ \\ / _` || __| / _ \\| || | / _` |",
  " ___) || (_| || |_ |  __/| || || (_| |",
  "|____/ \\__,_| \\__| \\___||_||_| \\__,_|",
] as const;

const BANNER_ROW_COLORS = [
  "\u001B[38;5;140m",
  "\u001B[38;5;176m",
  "\u001B[38;5;212m",
  "\u001B[38;5;218m",
  "\u001B[38;5;219m",
] as const;

const ANSI_RESET = "\u001B[0m";

export const isDevelopmentContext = (): boolean =>
  process.env["SATELLA_DATABASE_CONTEXT"] === "development";

export const startupBanner = (dashboardUrl: string): string => {
  const useColors = process.stdout.isTTY === true && process.env["NO_COLOR"] === undefined;
  const art = BANNER_ROWS.map((row, index) =>
    useColors ? `${BANNER_ROW_COLORS[index]}${row}${ANSI_RESET}` : row,
  ).join("\n");
  return `${art}\n\n  Dashboard: ${dashboardUrl}`;
};

export const printStartupBanner = (dashboardUrl: string, stream = process.stdout): void => {
  stream.write(`${startupBanner(dashboardUrl)}\n`);
};

export const parsePort = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : fallback;
};

export const shouldOpenBrowser = () =>
  process.env["SATELLA_OPEN_BROWSER"] !== "0" &&
  process.env["SATELLA_DATABASE_CONTEXT"] !== "development";

export const appOrigin = (port: number) => `http://127.0.0.1:${port}`;

export const mcpUrl = (port: number) => `${appOrigin(port)}/mcp`;

export const isLiveSatella = async (port: number): Promise<boolean> => {
  try {
    const response = await fetch(`${appOrigin(port)}/api/hello`, {
      signal: AbortSignal.timeout(750),
    });
    if (!response.ok) return false;
    Schema.decodeUnknownSync(HelloBody)(await response.json());
    return true;
  } catch {
    return false;
  }
};

export const openBrowser = (url: string) => {
  const platform = process.platform;
  const child =
    platform === "darwin"
      ? spawn("open", [url], { stdio: "ignore", detached: true })
      : platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true })
        : spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  child.unref();
};

export const resolveWebDirectory = (fromModuleUrl = import.meta.url): string | undefined => {
  const override = process.env["SATELLA_WEB_DIR"];
  if (override !== undefined && override.length > 0) return override;
  const bundled = join(dirname(fileURLToPath(fromModuleUrl)), "public");
  try {
    if (statSync(join(bundled, "index.html")).isFile()) return bundled;
  } catch {
    return undefined;
  }
  return bundled;
};

const containedFile = (root: string, pathname: string): string | undefined => {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/u, "");
  const requested = resolve(root, relativePath);
  const base = resolve(root);
  if (requested !== base && !requested.startsWith(`${base}${sep}`)) return undefined;
  if (existsSync(requested) && statSync(requested).isFile()) return requested;
  const index = join(root, "index.html");
  if (existsSync(index) && statSync(index).isFile()) return index;
  return undefined;
};

export const ServeUi = (webDir: string | undefined) =>
  HttpRouter.middleware(
    (httpApp) =>
      Effect.gen(function* () {
        if (webDir === undefined) return yield* httpApp;
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (request.method !== "GET" && request.method !== "HEAD") return yield* httpApp;
        let pathname = request.url;
        try {
          pathname = new URL(request.url, "http://127.0.0.1").pathname;
        } catch {
          pathname = request.url.split("?", 1)[0] ?? request.url;
        }
        if (pathname.startsWith("/api") || pathname === "/mcp") return yield* httpApp;
        const target = containedFile(webDir, pathname);
        if (target === undefined) return yield* httpApp;
        return yield* HttpServerResponse.file(target);
      }),
    { global: true },
  );
