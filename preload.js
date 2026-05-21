const os = require("os");
const fs = require("fs");
const path = require("path");

function getUserDataPath() {
  // Primary: path passed from main process via additionalArguments
  const arg = process.argv.find(a => a.startsWith("--user-data-path="));
  if (arg) {
    try {
      return decodeURIComponent(arg.slice("--user-data-path=".length));
    } catch {}
  }
  // Fallback: derive from OS (matches Electron's app.getPath("userData"))
  const appName = "Omnyx";
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
  } else if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  return path.join(os.homedir(), ".config", appName);
}

try {
  const userDataPath = getUserDataPath();
  const data = JSON.parse(fs.readFileSync(path.join(userDataPath, "auth.json"), "utf8"));
  if (data.token) {
    localStorage.setItem("omnyx_token", data.token);
  }
} catch {}
