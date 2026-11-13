const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

const fileEnv = loadEnvFile(path.join(__dirname, ".env"));

module.exports = {
  apps: [
    {
      name: "carto-chat-vps",
      cwd: __dirname,
      script: "worker.mjs",
      interpreter: "node",
      autorestart: true,
      max_restarts: 20,
      env: {
        CARTO_CHAT_VPS_PORT: "3847",
        CARTO_CHAT_VPS_BIND: "127.0.0.1",
        CARTO_CHAT_TIMEOUT_MS: "300000",
        CARTO_CHAT_EFFORT_LEVEL: "2", // Medium / Moyen
        ...fileEnv,
      },
    },
  ],
};
