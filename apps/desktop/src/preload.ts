import { contextBridge, ipcRenderer } from "electron";

const engineArgument = (name: string) => {
  const prefix = `--satella-${name}=`;
  const argument = process.argv.find((argument) => argument.startsWith(prefix));
  return argument?.slice(prefix.length);
};
const engineUrl = engineArgument("engine-url");
const engineToken = engineArgument("engine-token");

const satellaRuntime = {
  clearVaultCaches: () => ipcRenderer.invoke("satella:clear-vault-caches"),
  // SAFETY: the paired main-process handlers resolve to a single path string or
  // undefined when the native dialog is cancelled.
  showVaultSaveDialog: (defaultPath: string = "") =>
    ipcRenderer.invoke("satella:show-save-dialog", defaultPath) as Promise<string | undefined>,
  // SAFETY: the paired main-process handler resolves to a single path string or
  // undefined when the native dialog is cancelled.
  showVaultOpenDialog: () =>
    ipcRenderer.invoke("satella:show-open-dialog") as Promise<string | undefined>,
};
if (engineUrl !== undefined) Object.assign(satellaRuntime, { engineUrl });
if (engineToken !== undefined) Object.assign(satellaRuntime, { engineToken });

contextBridge.exposeInMainWorld("satellaRuntime", satellaRuntime);
