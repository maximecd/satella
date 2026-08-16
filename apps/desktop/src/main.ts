import { app, BrowserWindow, powerMonitor } from "electron";
import { join } from "node:path";

import {
  managedEngineCommand,
  managedEngineEnvironment,
  screenLockRequest,
  spawnManagedEngine,
  stopManagedEngine,
  waitForEngineHello,
} from "./engine.js";
import { shouldQuitOnLastWindow, windowLoadTarget } from "./window.js";

const developmentUrl = process.env["OPTIMUS_WEB_URL"];
const enginePort = Number(process.env["OPTIMUS_ENGINE_PORT"] ?? "3001");
const engineUrl = process.env["OPTIMUS_ENGINE_URL"] ?? `http://127.0.0.1:${enginePort}`;

let engineProcess: ReturnType<typeof spawnManagedEngine> | undefined;

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
      sandbox: true,
    },
    width: 1120,
  });

  window.once("ready-to-show", () => window.show());

  const target = windowLoadTarget(developmentUrl);
  if (target.type === "url") {
    await window.loadURL(target.url);
  } else {
    await window.loadFile(target.path);
  }
};

const startManagedEngine = async () => {
  const command = managedEngineCommand(developmentUrl);
  if (command === undefined) return;
  engineProcess = spawnManagedEngine(
    command,
    managedEngineEnvironment(process.env, {
      port: enginePort,
      dataDirectory: join(app.getPath("userData"), "data"),
    }),
  );
  await waitForEngineHello(enginePort);
};

void app.whenReady().then(async () => {
  await startManagedEngine();
  await createWindow();

  powerMonitor.on("lock-screen", lockViaEngine);
  powerMonitor.on("resume", lockViaEngine);
  powerMonitor.on("suspend", lockViaEngine);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (shouldQuitOnLastWindow(process.platform)) {
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopManagedEngine(engineProcess);
});

process.on("exit", () => {
  engineProcess?.kill("SIGKILL");
});
