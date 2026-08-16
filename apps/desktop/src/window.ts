import { join } from "node:path";

export const windowLoadTarget = (url: string | undefined, moduleDir = __dirname) =>
  url === undefined
    ? { type: "file" as const, path: join(moduleDir, "../../web/dist/index.html") }
    : { type: "url" as const, url };

export const shouldQuitOnLastWindow = (_platform: NodeJS.Platform) => true;
