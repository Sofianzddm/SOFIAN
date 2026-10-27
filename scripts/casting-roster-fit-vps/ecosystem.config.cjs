/**
 * PM2 — worker casting roster-fit sur le VPS.
 *
 * Depuis la racine du repo cloné sur le VPS :
 *   pm2 start scripts/casting-roster-fit-vps/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "casting-roster-fit-worker",
      cwd: process.cwd(),
      script: "pnpm",
      args: "exec tsx scripts/casting-roster-fit-worker.ts",
      interpreter: "none",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "10s",
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        // Surcharger via ecosystem local / .env — ne pas committer de secrets.
      },
    },
  ],
};
