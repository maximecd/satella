import { join } from "node:path";

import { app, BrowserWindow } from "electron";

const developmentUrl = process.env["OPTIMUS_WEB_URL"];

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

  if (developmentUrl !== undefined) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(join(__dirname, "../../web/dist/index.html"));
  }
};

void app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
