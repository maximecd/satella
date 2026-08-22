import { join } from "node:path";

export const windowLoadTarget = (
  url: string | undefined,
  moduleDir = __dirname,
  options: { readonly isPackaged?: boolean; readonly resourcesPath?: string } = {},
) =>
  url === undefined
    ? {
        type: "file" as const,
        path:
          options.isPackaged === true && options.resourcesPath !== undefined
            ? join(options.resourcesPath, "web", "dist", "index.html")
            : join(moduleDir, "../../web/dist/index.html"),
      }
    : { type: "url" as const, url };

export type NavigationDecision = { readonly type: "allow" } | { readonly type: "deny" };

const PACKAGED_DOCUMENT_SUFFIX = /web[/\\]dist[/\\]index\.html$/;

export const navigationPermission = (
  target: string | URL,
  context: {
    readonly developmentUrl?: string | undefined;
    readonly isPackaged?: boolean | undefined;
  } = {},
): NavigationDecision => {
  let url: URL;
  try {
    url = target instanceof URL ? target : new URL(target);
  } catch {
    return { type: "deny" };
  }
  if (context.isPackaged === true) {
    return url.protocol === "file:" && PACKAGED_DOCUMENT_SUFFIX.test(url.pathname)
      ? { type: "allow" }
      : { type: "deny" };
  }
  if (context.developmentUrl === undefined) return { type: "deny" };
  let developmentOrigin: URL;
  try {
    developmentOrigin = new URL(context.developmentUrl);
  } catch {
    return { type: "deny" };
  }
  return `${url.protocol}//${url.host}` ===
    `${developmentOrigin.protocol}//${developmentOrigin.host}`
    ? { type: "allow" }
    : { type: "deny" };
};

export type ExternalUrlAction =
  | { readonly action: "open-external"; readonly url: string }
  | { readonly action: "deny" };

export const externalUrlAction = (target: string | URL): ExternalUrlAction => {
  let url: URL;
  try {
    url = target instanceof URL ? target : new URL(target);
  } catch {
    return { action: "deny" };
  }
  if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0) {
    return { action: "open-external", url: url.toString() };
  }
  return { action: "deny" };
};

/**
 * The macOS tray keeps the app alive when the last window closes. Other
 * platforms have no tray yet, so closing their last window still quits.
 */
export const shouldQuitOnLastWindow = (platform: NodeJS.Platform) => platform !== "darwin";

export const closeToTray =
  (window: { readonly hide: () => void }, isQuitting: () => boolean) =>
  (event: { preventDefault: () => void }) => {
    if (isQuitting()) return;
    event.preventDefault();
    window.hide();
  };

export const trayIconPath = (
  moduleDir = __dirname,
  options: { readonly isPackaged?: boolean; readonly resourcesPath?: string } = {},
) =>
  options.isPackaged === true && options.resourcesPath !== undefined
    ? join(options.resourcesPath, "assets", "trayTemplate.png")
    : join(moduleDir, "../assets/trayTemplate.png");

export const focusWindow = (window: {
  readonly isMinimized: () => boolean;
  readonly restore: () => void;
  readonly show: () => void;
  readonly focus: () => void;
}) => {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};
