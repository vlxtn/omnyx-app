const { app, BrowserWindow, shell, globalShortcut, Tray, Menu, nativeImage, dialog, session } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

let mainWindow;
let tray;
let isQuitting = false;
const COOKIE_URL = "https://useomnyx.com";
const COOKIE_NAME = "omnyx_electron_token";

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
  try { fs.unlinkSync(getAuthFilePath()); } catch {}
}

async function persistToken(token) {
  saveTokenToFile(token);
  try {
    await session.defaultSession.cookies.set({
      url: COOKIE_URL,
      name: COOKIE_NAME,
      value: encodeURIComponent(token),
      httpOnly: false,
      secure: true,
      sameSite: "no_restriction",
      expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });
  } catch {}
}

async function clearPersistedToken() {
  clearTokenFile();
  try {
    await session.defaultSession.cookies.remove(COOKIE_URL, COOKIE_NAME);
  } catch {}
}

async function createWindow() {
  const savedToken = readSavedToken();

  // Set the cookie BEFORE loading the URL so the page's JS can read it immediately
  if (savedToken) {
    await persistToken(savedToken);
  }

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
    },
    backgroundColor: "#07060e",
    show: false,
  });

  // Go directly to dashboard if we have a token — the cookie will authenticate the session
  mainWindow.loadURL(savedToken ? `${COOKIE_URL}/dashboard` : `${COOKIE_URL}/login`);

  // After navigating to dashboard (post-login), persist the fresh token
  mainWindow.webContents.on("did-navigate-in-page", (event, url) => {
    if (url.includes("/dashboard")) {
      mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
        .then(token => { if (token) persistToken(token); })
        .catch(() => {});
    }
    // User logged out (navigated to /login with no token)
    if (url.includes("/login")) {
      setTimeout(() => {
        mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
          .then(token => { if (!token) clearPersistedToken(); })
          .catch(() => {});
      }, 300);
    }
  });

  // Also persist on full page load (catches /dashboard loaded directly at startup)
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
      .then(token => { if (token) persistToken(token); })
      .catch(() => {});
  });

  // 401 from backend → clear everything so the preload/cookie don't re-inject a bad token
  mainWindow.webContents.session.webRequest.onCompleted(
    { urls: ["*://omnyx-backend-production.up.railway.app/*"] },
    (details) => {
      if (details.statusCode === 401) clearPersistedToken();
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
    if (!url.startsWith(COOKIE_URL)) {
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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await createWindow();
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
