import type { AppLanguage } from "./app-language";

export interface SatellaRuntimeConfiguration {
  readonly engineUrl: string;
  readonly engineToken?: string;
  readonly clearVaultCaches?: () => Promise<void>;
  readonly showVaultSaveDialog?: (defaultPath?: string) => Promise<string | undefined>;
  readonly showVaultOpenDialog?: () => Promise<string | undefined>;
  readonly onVaultLocked?: (listener: () => void) => () => void;
  readonly reportVaultOpen?: (open: boolean) => void;
  readonly reportAppLanguage?: (language: AppLanguage) => void;
}
declare global {
  interface Window {
    readonly satellaRuntime?: SatellaRuntimeConfiguration;
  }
}

const configuredRuntime = (): SatellaRuntimeConfiguration | undefined => {
  const browserWindow = globalThis.window;
  if (browserWindow === undefined) return undefined;
  return browserWindow.satellaRuntime;
};

const runtimeEngineUrl = () => configuredRuntime()?.engineUrl;

export const engineUrl = () =>
  runtimeEngineUrl() ??
  import.meta.env["VITE_ENGINE_URL"] ??
  (import.meta.env.DEV
    ? "http://127.0.0.1:3001"
    : (() => {
        throw new Error("Packaged Satella did not provide a runtime engine URL");
      })());

export const engineToken = (): string | undefined =>
  configuredRuntime()?.engineToken ?? import.meta.env["VITE_ENGINE_TOKEN"] ?? undefined;

const showVaultSaveDialog = (defaultPath?: string) =>
  configuredRuntime()?.showVaultSaveDialog?.(defaultPath);

const showVaultOpenDialog = () => configuredRuntime()?.showVaultOpenDialog?.();

export const chooseVaultExportDestination = async (): Promise<
  { readonly kind: "path"; readonly path: string } | { readonly kind: "cancelled" }
> => {
  const path = await showVaultSaveDialog();
  return path === undefined ? { kind: "cancelled" } : { kind: "path", path };
};

export const chooseVaultImportSource = async (): Promise<
  { readonly kind: "path"; readonly path: string } | { readonly kind: "cancelled" }
> => {
  const path = await showVaultOpenDialog();
  return path === undefined ? { kind: "cancelled" } : { kind: "path", path };
};

export const clearVaultDerivedCaches = async () => {
  const browserWindow = globalThis.window;
  if (browserWindow !== undefined) {
    await browserWindow.satellaRuntime?.clearVaultCaches?.();
  }
  const cacheStorage = globalThis.caches;
  if (cacheStorage === undefined) return;
  await Promise.all((await cacheStorage.keys()).map((key) => cacheStorage.delete(key)));
};
