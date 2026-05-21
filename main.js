const { app, BrowserWindow, shell, globalShortcut, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

let mainWindow;
let tray;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: "#07060e",
    show: false,
  });

  mainWindow.loadURL("https://useomnyx.com/login");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Masquer dans la barre des tâches au lieu de fermer
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Ouvre les liens externes dans le navigateur
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

  // Raccourci global Ctrl+Shift+Space
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
