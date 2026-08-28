export const engineUrl = () =>
  import.meta.env["VITE_ENGINE_URL"] ?? (import.meta.env.DEV ? "http://127.0.0.1:3001" : "");

export const saveVaultExport = (fileName: string, contentsBase64: string) => {
  const binary = atob(contentsBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const clearVaultDerivedCaches = async () => {
  const cacheStorage = globalThis.caches;
  if (cacheStorage === undefined) return;
  await Promise.all((await cacheStorage.keys()).map((key) => cacheStorage.delete(key)));
};
