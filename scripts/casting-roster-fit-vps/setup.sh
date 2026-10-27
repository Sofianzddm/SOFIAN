#!/usr/bin/env bash
# Installe le worker casting roster-fit sur le VPS (pm2).
# Usage (depuis la racine du repo sur le VPS) :
#   bash scripts/casting-roster-fit-vps/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Manque .env à la racine (DATABASE_URL + XAI_API_KEY)."
  echo "Copie depuis Vercel ou crée-le, puis relance."
  exit 1
fi

if ! command -v node >/dev/null; then
  echo "Node.js requis."
  exit 1
fi

if ! command -v pnpm >/dev/null; then
  echo "Install pnpm…"
  corepack enable
  corepack prepare pnpm@latest --activate
fi

if ! command -v pm2 >/dev/null; then
  echo "Install pm2…"
  npm i -g pm2
fi

echo "==> pnpm install"
pnpm install --frozen-lockfile

echo "==> prisma generate"
pnpm exec prisma generate

echo "==> pm2 start/restart"
if pm2 describe casting-roster-fit-worker >/dev/null 2>&1; then
  pm2 restart casting-roster-fit-worker
else
  pm2 start scripts/casting-roster-fit-vps/ecosystem.config.cjs
fi

pm2 save
echo ""
echo "OK — worker casting-roster-fit-worker actif."
echo "Logs : pm2 logs casting-roster-fit-worker"
echo "Sur Vercel : CASTING_FIT_EXTERNAL_WORKER=1"
