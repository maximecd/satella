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
  if (typeof window === "undefined") return undefined;
  const runtime = window.optimusRuntime;
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
  if (typeof window !== "undefined") {
    await window.optimusRuntime?.clearVaultCaches?.();
  }
  if (typeof caches === "undefined") return;
  await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
};
