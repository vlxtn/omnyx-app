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

function readSavedToken() {
  try {
    const data = JSON.parse(fs.readFileSync(getAuthFilePath(), "utf8"));
    return data.token || null;
  } catch {
    return null;
  }
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

// preload.js must be outside the asar archive to be loadable
function getPreloadPath() {
  return path.join(__dirname, "preload.js").replace("app.asar", "app.asar.unpacked");
}

function createWindow() {
  // Decide start URL at launch time — go directly to dashboard if we have a saved token.
  // The preload will inject the token into localStorage before the page JS runs.
  const savedToken = readSavedToken();
  const startUrl = savedToken
    ? "https://useomnyx.com/dashboard"
    : "https://useomnyx.com/login";

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
      preload: getPreloadPath(),
      additionalArguments: [`--user-data-path=${encodeURIComponent(app.getPath("userData"))}`],
    },
    backgroundColor: "#07060e",
    show: false,
  });

  mainWindow.loadURL(startUrl);

  // Save token immediately when the user reaches the dashboard (post-login SPA navigation)
  mainWindow.webContents.on("did-navigate-in-page", (event, url) => {
    if (url.includes("/dashboard")) {
      mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
        .then(token => { if (token) saveTokenToFile(token); })
        .catch(() => {});
    }
    // True logout: user navigated to /login with no token
    if (url.includes("/login")) {
      setTimeout(() => {
        mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
          .then(token => { if (!token) clearTokenFile(); })
          .catch(() => {});
      }, 300);
    }
  });

  // Save token on full page load (covers first load of /dashboard when starting directly there)
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
      .then(token => { if (token) saveTokenToFile(token); })
      .catch(() => {});
  });

  // Detect 401 from backend → clear auth.json BEFORE the page redirects to /login,
  // so the preload won't re-inject an invalid token on the next load.
  mainWindow.webContents.session.webRequest.onCompleted(
    { urls: ["*://omnyx-backend-production.up.railway.app/*"] },
    (details) => {
      if (details.statusCode === 401) clearTokenFile();
    }
  );

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
