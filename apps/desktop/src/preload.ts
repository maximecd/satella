import { contextBridge, ipcRenderer } from "electron";

const engineArgument = process.argv.find((argument) =>
  argument.startsWith("--optimus-engine-url="),
);
const engineUrl = engineArgument?.slice("--optimus-engine-url=".length);

const optimusRuntime = {
  clearVaultCaches: () => ipcRenderer.invoke("optimus:clear-vault-caches"),
};
if (engineUrl !== undefined) Object.assign(optimusRuntime, { engineUrl });

contextBridge.exposeInMainWorld("optimusRuntime", optimusRuntime);
