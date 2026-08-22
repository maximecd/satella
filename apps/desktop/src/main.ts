import { app, BrowserWindow, dialog, ipcMain, powerMonitor, session, shell } from "electron";
import { join } from "node:path";

import {
  DEFAULT_ENGINE_PORT,
  chooseAvailableEnginePort,
  enginePortForDevelopment,
  managedEngineCommand,
  managedEngineEnvironment,
  newEngineToken,
  screenLockRequest,
  spawnManagedEngine,
  stopManagedEngine,
  waitForEngineHello,
} from "./engine.js";
import { APP_ID, APP_NAME, productionDataDirectory } from "./runtime.js";
import {
  externalUrlAction,
  focusWindow,
  navigationPermission,
  shouldQuitOnLastWindow,
  windowLoadTarget,
} from "./window.js";

const developmentUrl = process.env["SATELLA_WEB_URL"];
let enginePort = DEFAULT_ENGINE_PORT;
let engineUrl = process.env["SATELLA_ENGINE_URL"] ?? `http://127.0.0.1:${enginePort}`;
let engineProcess: ReturnType<typeof spawnManagedEngine> | undefined;
let mainWindow: BrowserWindow | undefined;
let engineToken = process.env["SATELLA_ENGINE_TOKEN"] ?? newEngineToken();
let quitting = false;
let pendingSecondInstance = false;

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
ipcMain.handle("satella:clear-vault-caches", async () => {
  await session.defaultSession.clearCache();
});
ipcMain.handle("satella:show-save-dialog", async (_event, defaultPath: string) => {
  const fallback = join(app.getPath("downloads"), `satella-vault-export.satella-vault`);
  const options: Electron.SaveDialogOptions = {
    defaultPath: defaultPath.length > 0 ? defaultPath : fallback,
    filters: [{ name: "Satella Vault", extensions: ["satella-vault"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"],
    title: "Export Vault",
  };
  const result =
    mainWindow === undefined
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(mainWindow, options);
  return result.canceled ? undefined : result.filePath;
});
ipcMain.handle("satella:show-open-dialog", async () => {
  const options: Electron.OpenDialogOptions = {
    filters: [{ name: "Satella Vault", extensions: ["satella-vault"] }],
    properties: ["openFile"],
    title: "Restore Vault",
  };
  const result =
    mainWindow === undefined
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options);
  return result.canceled ? undefined : result.filePaths[0];
});

const lockViaEngine = () => {
  const request = screenLockRequest(engineUrl, engineToken);
  void fetch(request.url, { method: request.method, headers: request.headers }).catch(
    () => undefined,
  );
};

const createWindow = async () => {
  const window = new BrowserWindow({
    backgroundColor: "#f6f5f2",
    height: 760,
    minHeight: 560,
    minWidth: 720,
    show: false,
    title: "Satella",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      additionalArguments: [
        `--satella-engine-url=${engineUrl}`,
        `--satella-engine-token=${engineToken}`,
      ],
    },
    width: 1120,
  });
  mainWindow = window;
  if (pendingSecondInstance) {
    pendingSecondInstance = false;
    focusWindow(window);
  }

  window.once("ready-to-show", () => window.show());

  window.webContents.on("will-navigate", (event, url) => {
    const permission = navigationPermission(url, {
      developmentUrl,
      isPackaged: app.isPackaged,
    });
    if (permission.type === "allow") return;
    event.preventDefault();
    const external = externalUrlAction(url);
    if (external.action === "open-external") void shell.openExternal(external.url);
  });
  window.webContents.setWindowOpenHandler((details) => {
    const external = externalUrlAction(details.url);
    if (external.action === "open-external") void shell.openExternal(external.url);
    return { action: "deny" };
  });

  const target = windowLoadTarget(developmentUrl, __dirname, {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  if (target.type === "url") {
    await window.loadURL(target.url);
  } else {
    await window.loadFile(target.path);
  }
};

const startManagedEngine = async () => {
  const smokePort =
    process.env["SATELLA_SMOKE_ENGINE_PORT"] === undefined
      ? undefined
      : enginePortForDevelopment({
          SATELLA_ENGINE_PORT: process.env["SATELLA_SMOKE_ENGINE_PORT"],
        });
  enginePort = app.isPackaged
    ? await chooseAvailableEnginePort(smokePort)
    : enginePortForDevelopment(process.env);
  engineUrl = `http://127.0.0.1:${enginePort}`;

  const command = managedEngineCommand(developmentUrl, __dirname, {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  if (command === undefined) return;

  const dataDirectory = app.isPackaged
    ? productionDataDirectory(app.getPath("userData"))
    : join(process.cwd(), ".satella");
  engineProcess = spawnManagedEngine(
    command,
    managedEngineEnvironment(process.env, {
      port: enginePort,
      dataDirectory,
      parentPid: process.pid,
      production: app.isPackaged,
      engineToken,
    }),
  );
  engineProcess.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[engine] ${chunk}`));
  engineProcess.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[engine] ${chunk}`));
  await waitForEngineHello(enginePort);
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow === undefined) pendingSecondInstance = true;
    else focusWindow(mainWindow);
  });

  void app
    .whenReady()
    .then(async () => {
      await startManagedEngine();
      await createWindow();

      powerMonitor.on("lock-screen", lockViaEngine);
      powerMonitor.on("resume", lockViaEngine);
      powerMonitor.on("suspend", lockViaEngine);

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow();
        } else if (mainWindow !== undefined) {
          focusWindow(mainWindow);
        }
      });
    })
    .catch((cause: unknown) => {
      console.error(cause instanceof Error ? cause.message : cause);
      app.quit();
    });

  app.on("window-all-closed", () => {
    if (shouldQuitOnLastWindow(process.platform)) {
      app.quit();
    }
  });

  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void stopManagedEngine(engineProcess).finally(() => app.quit());
  });

  process.on("exit", () => {
    engineProcess?.kill("SIGKILL");
  });
}
