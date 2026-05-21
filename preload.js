const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

// Inject saved token into localStorage BEFORE any page JavaScript runs
try {
  const userDataPath = ipcRenderer.sendSync("get-user-data-path");
  const raw = fs.readFileSync(path.join(userDataPath, "auth.json"), "utf8");
  const token = JSON.parse(raw).token;
  if (token) {
    localStorage.setItem("omnyx_token", token);
  }
} catch {}
