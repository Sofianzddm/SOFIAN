#!/usr/bin/env node
/**
 * Arrête next dev (port 3000) pour éviter un cache .next/dev corrompu
 * quand on lance pnpm build en parallèle.
 */
import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

let stopped = false;

try {
  const pids = run("lsof -ti :3000 2>/dev/null || true");
  if (pids) {
    for (const pid of pids.split(/\s+/).filter(Boolean)) {
      try {
        run(`kill -9 ${pid}`);
        stopped = true;
      } catch {
        /* ignore */
      }
    }
  }
} catch {
  /* port libre */
}

try {
  run("pkill -9 -f 'next dev' 2>/dev/null || true");
  stopped = true;
} catch {
  /* ignore */
}

if (stopped) {
  console.log("[glowup] Serveur dev arrêté (port 3000 / next dev).");
}
