const { app, BrowserWindow, shell, globalShortcut, Tray, Menu, nativeImage, dialog, session } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

// Notification push : dès qu'une release est publiée sur GitHub, le backend
// nous prévient via ce WebSocket et on vérifie immédiatement les mises à jour.
function connectUpdateSocket() {
  const ws = new WebSocket("wss://omnyx-backend-production.up.railway.app/api/ws/updates");
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "update_available") autoUpdater.checkForUpdatesAndNotify();
    } catch {}
  });
  ws.on("close", () => setTimeout(connectUpdateSocket, 10000));
  ws.on("error", () => ws.close());
}

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

function getCompanionExe() {
  const roots = [
    path.join(process.env.LOCALAPPDATA || "", "Programs"),
    "C:\\Program Files",
    "C:\\Program Files (x86)",
  ];
  for (const root of roots) {
    let entries;
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const entry of entries) {
      const exe = path.join(root, entry, "Omnyx Companion.exe");
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

function launchCompanion() {
  const exe = getCompanionExe();
  if (exe) execFile(exe, [], { detached: true }, () => {});
}

function installCompanionIfNeeded() {
  const exe = getCompanionExe();

  if (exe) {
    launchCompanion();
    return;
  }

  const bundled = path.join(process.resourcesPath, "companion-setup.exe");
  const stat = fs.existsSync(bundled) ? fs.statSync(bundled) : null;
  if (!stat || stat.size < 10000) return;

  execFile(bundled, [], { detached: true }, () => {
    setTimeout(() => launchCompanion(), 4000);
  });
}

async function createWindow() {
  const savedToken = readSavedToken();

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
    show: true,
  });

  mainWindow.loadURL(savedToken ? `${COOKIE_URL}/dashboard` : `${COOKIE_URL}/login`);

  mainWindow.webContents.on("did-navigate-in-page", (event, url) => {
    if (url.includes("/dashboard")) {
      mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
        .then(token => { if (token) persistToken(token); })
        .catch(() => {});
    }
    if (url.includes("/login")) {
      setTimeout(() => {
        mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
          .then(token => { if (!token) clearPersistedToken(); })
          .catch(() => {});
      }, 300);
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`localStorage.getItem("omnyx_token")`)
      .then(token => { if (token) persistToken(token); })
      .catch(() => {});
  });

  mainWindow.webContents.session.webRequest.onCompleted(
    { urls: ["*://omnyx-backend-production.up.railway.app/*"] },
    (details) => {
      if (details.statusCode === 401) clearPersistedToken();
    }
  );


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
  tray.setToolTip("Omnyx");

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

const gotInstanceLock = app.requestSingleInstanceLock();

if (!gotInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await createWindow();
    createTray();
    installCompanionIfNeeded(); // async, pas besoin d'attendre

    globalShortcut.register("Control+R", () => mainWindow?.webContents.reload());
    globalShortcut.register("Control+Shift+R", () => mainWindow?.webContents.reloadIgnoringCache());
    globalShortcut.register("Control+Shift+I", () => mainWindow?.webContents.toggleDevTools());

    // Décaler la vérification des mises à jour pour ne pas ralentir le démarrage,
    // puis se brancher sur le flux de notifications push du backend pour réagir
    // instantanément à chaque nouvelle release (filet de sécurité : re-vérif toutes les 6h)
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5000);
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 6 * 60 * 60 * 1000);
    connectUpdateSocket();
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

    app.on("activate", () => {
      mainWindow.show();
    });
  });
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Ne pas quitter — continuer en tâche de fond
  }
});
