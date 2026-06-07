const { app, BrowserWindow, shell, globalShortcut, Tray, Menu, nativeImage, dialog, session } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("child_process");
const https = require("https");
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

function downloadFile(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) return reject(new Error("Too many redirects"));
    https.get(url, { headers: { "User-Agent": "Omnyx-App" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest, redirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function installCompanionIfNeeded() {
  const markerPath = path.join(app.getPath("userData"), "companion-installed");
  if (fs.existsSync(markerPath)) return;

  const tmpPath = path.join(app.getPath("temp"), "omnyx-companion-setup.exe");

  // Essaie d'abord le fichier bundlé
  const bundled = path.join(process.resourcesPath, "companion-setup.exe");
  const bundledStat = fs.existsSync(bundled) ? fs.statSync(bundled) : null;

  let setupPath = null;
  if (bundledStat && bundledStat.size > 10000) {
    setupPath = bundled;
  } else {
    // Télécharge depuis GitHub releases
    try {
      await downloadFile(
        "https://github.com/vlxtn/omnyx-desktop/releases/latest/download/Omnyx-Setup.exe",
        tmpPath
      );
      const size = fs.statSync(tmpPath).size;
      if (size > 10000) setupPath = tmpPath;
    } catch {}
  }

  if (!setupPath) return;

  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "Installer le compagnon Omnyx",
    message: "Le compagnon Omnyx (barre système) va s'installer maintenant.",
    buttons: ["Installer", "Plus tard"],
    defaultId: 0,
  });

  if (response !== 0) return;

  execFile(setupPath, [], { detached: true }, (err) => {
    if (!err) fs.writeFileSync(markerPath, "1");
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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await createWindow();
  createTray();
  installCompanionIfNeeded(); // async, pas besoin d'attendre

  globalShortcut.register("Control+R", () => mainWindow?.webContents.reload());
  globalShortcut.register("Control+Shift+R", () => mainWindow?.webContents.reloadIgnoringCache());
  globalShortcut.register("Control+Shift+I", () => mainWindow?.webContents.toggleDevTools());

  // Décaler la vérification des mises à jour pour ne pas ralentir le démarrage
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5000);
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

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Ne pas quitter — continuer en tâche de fond
  }
});
