import { app, BrowserWindow, ipcMain, powerMonitor, session } from "electron";
import { join } from "node:path";

import {
  DEFAULT_ENGINE_PORT,
  chooseAvailableEnginePort,
  enginePortForDevelopment,
  managedEngineCommand,
  managedEngineEnvironment,
  screenLockRequest,
  spawnManagedEngine,
  stopManagedEngine,
  waitForEngineHello,
} from "./engine.js";
import { APP_ID, APP_NAME, productionDataDirectory } from "./runtime.js";
import { focusWindow, shouldQuitOnLastWindow, windowLoadTarget } from "./window.js";

const developmentUrl = process.env["OPTIMUS_WEB_URL"];
let enginePort = DEFAULT_ENGINE_PORT;
let engineUrl = process.env["OPTIMUS_ENGINE_URL"] ?? `http://127.0.0.1:${enginePort}`;
let engineProcess: ReturnType<typeof spawnManagedEngine> | undefined;
let mainWindow: BrowserWindow | undefined;
let quitting = false;
let pendingSecondInstance = false;

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
ipcMain.handle("optimus:clear-vault-caches", async () => {
  await session.defaultSession.clearCache();
});

const lockViaEngine = () => {
  const request = screenLockRequest(engineUrl);
  void fetch(request.url, { method: request.method }).catch(() => undefined);
};

const createWindow = async () => {
  const window = new BrowserWindow({
    backgroundColor: "#f6f5f2",
    height: 760,
    minHeight: 560,
    minWidth: 720,
    show: false,
    title: "Optimus",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      additionalArguments: [`--optimus-engine-url=${engineUrl}`],
    },
    width: 1120,
  });
  mainWindow = window;
  if (pendingSecondInstance) {
    pendingSecondInstance = false;
    focusWindow(window);
  }

  window.once("ready-to-show", () => window.show());

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
    process.env["OPTIMUS_SMOKE_ENGINE_PORT"] === undefined
      ? undefined
      : enginePortForDevelopment({
          OPTIMUS_ENGINE_PORT: process.env["OPTIMUS_SMOKE_ENGINE_PORT"],
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
    : join(process.cwd(), ".optimus");
  engineProcess = spawnManagedEngine(
    command,
    managedEngineEnvironment(process.env, {
      port: enginePort,
      dataDirectory,
      parentPid: process.pid,
      production: app.isPackaged,
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
