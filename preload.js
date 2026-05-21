const fs = require("fs");
const path = require("path");

// userData path is passed from main process via additionalArguments
const arg = process.argv.find(a => a.startsWith("--user-data-path="));
const userDataPath = arg ? arg.slice("--user-data-path=".length) : null;

if (userDataPath) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(userDataPath, "auth.json"), "utf8"));
    if (data.token) {
      localStorage.setItem("omnyx_token", data.token);
    }
  } catch {}
}
