import { contextBridge, ipcRenderer } from "electron";

const engineArgument = process.argv.find((argument) =>
  argument.startsWith("--optimus-engine-url="),
);
const engineUrl = engineArgument?.slice("--optimus-engine-url=".length);

contextBridge.exposeInMainWorld("optimusRuntime", {
  ...(engineUrl === undefined ? {} : { engineUrl }),
  clearVaultCaches: () => ipcRenderer.invoke("optimus:clear-vault-caches"),
});
