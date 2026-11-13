#!/usr/bin/env bash
# Installe Chrome (CDP) + worker carto-chat sur le VPS.
# Usage (sur le VPS, depuis la racine du repo) :
#   bash scripts/carto-chat-vps/setup-vps.sh
#
# Prérequis : Node 20+, accès sudo pour Chrome deps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKER_DIR="$ROOT/scripts/carto-chat-vps"
PROFILE_DIR="${CARTO_CHAT_PROFILE_DIR:-/opt/chatgpt-profile}"
SECRET="${CARTO_CHAT_VPS_SECRET:-}"

cd "$WORKER_DIR"

if [[ -z "$SECRET" ]]; then
  if [[ -f "$ROOT/.env" ]] && grep -q '^CARTO_CHAT_VPS_SECRET=' "$ROOT/.env"; then
    # shellcheck disable=SC1091
    set -a && source "$ROOT/.env" && set +a
    SECRET="${CARTO_CHAT_VPS_SECRET:-}"
  fi
fi
if [[ -z "$SECRET" ]]; then
  SECRET="$(openssl rand -base64 32 | tr -d '\n=/+' | head -c 40)"
  echo "Secret généré — ajoute-le aussi dans .env.local / Vercel :"
  echo "  CARTO_CHAT_VPS_SECRET=$SECRET"
fi

echo "==> npm install (worker)"
npm install
npx playwright install chromium
npx playwright install-deps chromium || true

echo "==> profil Chrome $PROFILE_DIR"
sudo mkdir -p "$PROFILE_DIR"
sudo chown -R "$(whoami):$(whoami)" "$PROFILE_DIR"

ENV_FILE="$WORKER_DIR/.env"
cat > "$ENV_FILE" <<EOF
CARTO_CHAT_CDP_URL=http://127.0.0.1:9222
CARTO_CHAT_VPS_PORT=3847
CARTO_CHAT_VPS_BIND=127.0.0.1
CARTO_CHAT_VPS_SECRET=$SECRET
CARTO_CHAT_TIMEOUT_MS=300000
CARTO_CHAT_PROFILE_DIR=$PROFILE_DIR
EOF

echo "==> pm2"
if ! command -v pm2 >/dev/null; then
  npm i -g pm2
fi

# Charge l'env dans pm2
export $(grep -v '^#' "$ENV_FILE" | xargs)

if pm2 describe carto-chat-vps >/dev/null 2>&1; then
  pm2 restart carto-chat-vps --update-env
else
  pm2 start ecosystem.config.cjs --update-env
fi
pm2 save

echo ""
echo "OK — worker carto-chat-vps."
echo ""
echo "1) Lance Chrome avec CDP (une fois, laisse ouvert) :"
echo "   google-chrome --remote-debugging-port=9222 --user-data-dir=$PROFILE_DIR --no-first-run https://chatgpt.com/"
echo "   (ou chromium-browser …) puis login via VNC/noVNC"
echo ""
echo "2) Depuis ton Mac :"
echo "   ssh -N -L 3847:127.0.0.1:3847 USER@VPS"
echo ""
echo "3) .env.local Mac / Vercel :"
echo "   CARTO_CHAT_VPS_URL=http://127.0.0.1:3847"
echo "   CARTO_CHAT_VPS_SECRET=$SECRET"
echo ""
echo "Health : curl -s http://127.0.0.1:3847/health -H \"Authorization: Bearer \$CARTO_CHAT_VPS_SECRET\""
echo ""
echo "Prod HTTPS : bash scripts/carto-chat-vps/expose-prod.sh"
