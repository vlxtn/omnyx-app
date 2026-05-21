const { app, BrowserWindow, shell, globalShortcut, Tray, Menu, nativeImage, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

let mainWindow;
let tray;
let isQuitting = false;

function getAuthFilePath() {
  return path.join(app.getPath("userData"), "auth.json");
}

function saveTokenToFile(token) {
  try {
    fs.writeFileSync(getAuthFilePath(), JSON.stringify({ token }), "utf8");
  } catch {}
}

function clearTokenFile() {
  try {
    fs.unlinkSync(getAuthFilePath());
  } catch {}
}

async function syncTokenFromPage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const token = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem("omnyx_token")`
    );
    if (token) {
      saveTokenToFile(token);
    } else {
      clearTokenFile();
    }
  } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, "assets", "icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#07060e",
      symbolColor: "#ffffff",
      height: 32,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // Pass userData path so preload can read auth.json without IPC
      additionalArguments: [`--user-data-path=${encodeURIComponent(app.getPath("userData"))}`],
    },
    backgroundColor: "#07060e",
    show: false,
  });

  mainWindow.loadURL("https://useomnyx.com/login");

  // Sync token on every full page load
  mainWindow.webContents.on("did-finish-load", () => {
    syncTokenFromPage();
  });

  // Poll every 4 seconds to catch SPA navigations (login → dashboard)
  // where did-finish-load doesn't fire
  const pollInterval = setInterval(() => {
    syncTokenFromPage();
  }, 4000);

  mainWindow.on("closed", () => {
    clearInterval(pollInterval);
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("https://useomnyx.com")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "icon.png")).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Omnyx — Ctrl+Shift+Space");

  const menu = Menu.buildFromTemplate([
    { label: "Ouvrir Omnyx", click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: "separator" },
    { label: "Quitter", click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();

  autoUpdater.checkForUpdatesAndNotify();
  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox({
      type: "info",
      title: "Mise à jour disponible",
      message: "Une nouvelle version d'Omnyx est prête. Elle sera installée au prochain démarrage.",
      buttons: ["Redémarrer maintenant", "Plus tard"],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  globalShortcut.register("Control+Shift+Space", () => {
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("activate", () => {
    mainWindow.show();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Ne pas quitter — continuer en tâche de fond
  }
});
