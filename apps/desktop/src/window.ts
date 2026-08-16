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

export const shouldQuitOnLastWindow = (_platform: NodeJS.Platform) => true;

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
