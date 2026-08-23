import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  session,
  shell,
  Tray,
} from "electron";
import { join } from "node:path";

import {
  DEFAULT_ENGINE_PORT,
  chooseAvailableEnginePort,
  enginePortForDevelopment,
  managedEngineCommand,
  managedEngineEnvironment,
  newEngineToken,
  decodeManagedOperationalMessage,
  isFiniteManagedProcessNumber,
  type ManagedProcessValue,
  screenLockRequest,
  vaultActivityRequest,
  spawnManagedEngine,
  stopManagedEngine,
  waitForEngineHello,
} from "./engine.js";
import { APP_ID, APP_NAME, productionDataDirectory } from "./runtime.js";
import {
  applicationIconPath,
  createWindowLifecycle,
  externalUrlAction,
  navigationPermission,
  shouldQuitOnLastWindow,
  trayIconPath,
  windowLoadTarget,
} from "./window.js";
import { createTrayState, setTrayLanguage, type TrayStateController } from "./tray.js";
import type { ManagedOperationalMessage } from "./engine.js";

const developmentUrl = process.env["SATELLA_WEB_URL"];
let enginePort = DEFAULT_ENGINE_PORT;
let engineUrl = process.env["SATELLA_ENGINE_URL"] ?? `http://127.0.0.1:${enginePort}`;
let engineProcess: ReturnType<typeof spawnManagedEngine> | undefined;
let mainWindow: BrowserWindow | undefined;
let engineToken = process.env["SATELLA_ENGINE_TOKEN"] ?? newEngineToken();
let tray: Tray | undefined;
let trayState: TrayStateController | undefined;
let operationalState: ManagedOperationalMessage = {
  type: "operational-state",
  autoRefresh: { lastCycleAt: null, lastCycleOutcome: null },
  vault: { state: "locked", screenLock: false },
};
let quitting = false;
let windowLifecycle: ReturnType<typeof createWindowLifecycle>;

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
ipcMain.handle("satella:clear-vault-caches", async () => {
  await session.defaultSession.clearCache();
});
ipcMain.on("satella:vault-activity", (_event, activityAt: ManagedProcessValue) => {
  if (!isFiniteManagedProcessNumber(activityAt)) return;
  const request = vaultActivityRequest(engineUrl, engineToken, activityAt);
  void fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  }).catch(() => undefined);
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
// SAFETY: only the paired preload bridge sends "satella:app-language".
ipcMain.on("satella:app-language", (_event, language: string) => {
  if (trayState === undefined) setTrayLanguage(language);
  else trayState.setLanguage(language);
});

const handleManagedEngineMessage = (value: ManagedProcessValue) => {
  const message = decodeManagedOperationalMessage(value);
  if (message === undefined) return;
  const wasScreenLocked = operationalState.vault.screenLock;
  operationalState = message;
  trayState?.setState({
    status: message.autoRefresh,
    vaultOpen: message.vault.state === "open" && !message.vault.screenLock,
  });
  if (!wasScreenLocked && message.vault.screenLock) {
    mainWindow?.webContents.send("satella:vault-locked");
  }
};

const lockViaEngine = async () => {
  const request = screenLockRequest(engineUrl, engineToken);
  try {
    await fetch(request.url, { method: request.method, headers: request.headers });
  } catch {
    return;
  }
  // Tell the renderer so it swaps to the lock screen immediately.
  mainWindow?.webContents.send("satella:vault-locked");
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
  windowLifecycle.attach(window);
  window.on("close", (event) => windowLifecycle.handleClose(window, event));

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

const openWindow = () => windowLifecycle.open();

const setApplicationIcon = () => {
  if (process.platform !== "darwin") return;
  const icon = nativeImage.createFromPath(
    applicationIconPath(__dirname, {
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }),
  );
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
};

/**
 * While the window is closed to tray the app keeps running, so the Dock icon
 * must go; dock.show() can reset the custom icon, hence re-applying it.
 */
const hideDockIcon = () => {
  if (process.platform === "darwin") app.dock?.hide();
};

const showDockIcon = () => {
  if (process.platform !== "darwin") return;
  app.dock?.show();
  setApplicationIcon();
};

windowLifecycle = createWindowLifecycle({
  createWindow: () => void createWindow(),
  isQuitting: () => quitting,
  onDormant: () => {
    mainWindow = undefined;
  },
  onHidden: hideDockIcon,
  onOpened: showDockIcon,
});

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
      logDirectory: app.getPath("logs"),
      production: app.isPackaged,
      engineToken,
    }),
  );
  engineProcess.on("message", handleManagedEngineMessage);
  engineProcess.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[engine] ${chunk}`));
  engineProcess.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[engine] ${chunk}`));
  await waitForEngineHello(enginePort);
};

const createTray = () => {
  if (process.platform !== "darwin") return;
  const icon = nativeImage.createFromPath(
    trayIconPath(__dirname, {
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }),
  );
  icon.setTemplateImage(true);
  // Keep a module-level reference so Electron cannot garbage-collect the tray.
  tray = new Tray(icon);
  trayState = createTrayState({
    adapter: {
      replaceMenu: (items) => {
        tray?.setContextMenu(Menu.buildFromTemplate([...items]));
      },
    },
    actions: {
      open: () => openWindow(),
      lockNow: () => void lockViaEngine(),
      quit: () => app.quit(),
    },
    initialStatus: operationalState.autoRefresh,
    initialVaultOpen: operationalState.vault.state === "open" && !operationalState.vault.screenLock,
  });
  tray.on("click", () => openWindow());
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    openWindow();
  });

  void app
    .whenReady()
    .then(async () => {
      setApplicationIcon();
      await startManagedEngine();
      await createWindow();
      createTray();

      powerMonitor.on("lock-screen", lockViaEngine);
      powerMonitor.on("resume", lockViaEngine);
      powerMonitor.on("suspend", lockViaEngine);

      app.on("activate", () => {
        openWindow();
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
    windowLifecycle.dispose();
    trayState?.dispose();
    void stopManagedEngine(engineProcess).finally(() => app.quit());
  });

  process.on("exit", () => {
    engineProcess?.kill("SIGKILL");
  });
}
