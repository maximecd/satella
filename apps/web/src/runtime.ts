export interface OptimusRuntimeConfiguration {
  readonly engineUrl: string;
  readonly clearVaultCaches?: () => Promise<void>;
}

declare global {
  interface Window {
    readonly optimusRuntime?: OptimusRuntimeConfiguration;
  }
}

const configuredRuntime = () => {
  const browserWindow = globalThis.window;
  if (browserWindow === undefined) return undefined;
  const runtime = browserWindow.optimusRuntime;
  return runtime?.engineUrl;
};

export const engineUrl = () =>
  configuredRuntime() ??
  import.meta.env["VITE_ENGINE_URL"] ??
  (import.meta.env.DEV
    ? "http://127.0.0.1:3001"
    : (() => {
        throw new Error("Packaged Optimus did not provide a runtime engine URL");
      })());

export const clearVaultDerivedCaches = async () => {
  const browserWindow = globalThis.window;
  if (browserWindow !== undefined) {
    await browserWindow.optimusRuntime?.clearVaultCaches?.();
  }
  const cacheStorage = globalThis.caches;
  if (cacheStorage === undefined) return;
  await Promise.all((await cacheStorage.keys()).map((key) => cacheStorage.delete(key)));
};
