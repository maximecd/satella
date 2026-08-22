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

export const WINDOW_DORMANCY_GRACE_MS = 60_000;

export type WindowLifecycleState = "active" | "hidden" | "dormant";

export interface WindowLifecycleWindow {
  readonly hide: () => void;
  readonly destroy: () => void;
  readonly isMinimized: () => boolean;
  readonly restore: () => void;
  readonly show: () => void;
  readonly focus: () => void;
}

export interface WindowLifecycle {
  readonly state: () => WindowLifecycleState;
  readonly attach: (window: WindowLifecycleWindow) => void;
  readonly handleClose: (
    window: WindowLifecycleWindow,
    event: { readonly preventDefault: () => void },
  ) => void;
  readonly open: () => "focused" | "create";
  readonly dispose: () => void;
}

/** Manages the active → hidden grace period → dormant renderer lifecycle. */
export const createWindowLifecycle = (options: {
  readonly createWindow: () => void;
  readonly isQuitting: () => boolean;
  readonly focus?: (window: WindowLifecycleWindow) => void;
  readonly gracePeriodMs?: number;
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
  readonly onDormant?: () => void;
}): WindowLifecycle => {
  const focus = options.focus ?? focusWindow;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel =
    options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const gracePeriodMs = options.gracePeriodMs ?? WINDOW_DORMANCY_GRACE_MS;
  let current: WindowLifecycleWindow | undefined;
  let currentState: WindowLifecycleState = "dormant";
  let dormancyTimer: unknown;

  const cancelDormancy = () => {
    if (dormancyTimer !== undefined) {
      cancel(dormancyTimer);
      dormancyTimer = undefined;
    }
  };

  const enterDormancy = (window: WindowLifecycleWindow) => {
    if (current !== window || currentState !== "hidden") return;
    dormancyTimer = undefined;
    current = undefined;
    currentState = "dormant";
    options.onDormant?.();
    window.destroy();
  };

  const scheduleDormancy = (window: WindowLifecycleWindow) => {
    cancelDormancy();
    dormancyTimer = schedule(() => enterDormancy(window), gracePeriodMs);
  };

  return {
    state: () => currentState,
    attach: (window) => {
      cancelDormancy();
      current = window;
      currentState = "active";
    },
    handleClose: (window, event) => {
      if (options.isQuitting() || current !== window) return;
      event.preventDefault();
      if (currentState === "active") {
        currentState = "hidden";
        window.hide();
        scheduleDormancy(window);
      }
    },
    open: () => {
      if (current !== undefined && currentState !== "dormant") {
        cancelDormancy();
        currentState = "active";
        focus(current);
        return "focused";
      }
      options.createWindow();
      return "create";
    },
    dispose: cancelDormancy,
  };
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
