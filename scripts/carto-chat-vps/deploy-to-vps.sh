#!/usr/bin/env bash
# Déploie le worker carto-chat sur le VPS Contabo + lance setup.
# Usage (depuis ton Mac, racine du repo) :
#   bash scripts/carto-chat-vps/deploy-to-vps.sh
#
# Demande le mot de passe SSH root une ou deux fois.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${CARTO_CHAT_VPS_SSH:-root@169.58.229.98}"
REMOTE_ROOT="${CARTO_CHAT_REMOTE_ROOT:-/opt/glowup-casting-worker}"
SECRET="${CARTO_CHAT_VPS_SECRET:-}"

if [[ -z "$SECRET" && -f "$ROOT/.env.local" ]]; then
  SECRET="$(grep -E '^CARTO_CHAT_VPS_SECRET=' "$ROOT/.env.local" | head -1 | cut -d= -f2-)"
fi
if [[ -z "$SECRET" ]]; then
  echo "CARTO_CHAT_VPS_SECRET manquant (.env.local)"
  exit 1
fi

echo "==> Cible $HOST  →  $REMOTE_ROOT/scripts/carto-chat-vps"
ssh "$HOST" "mkdir -p '$REMOTE_ROOT/scripts/carto-chat-vps'"

rsync -avz --delete \
  --exclude node_modules \
  --exclude .chatgpt-profile \
  --exclude '.env' \
  "$ROOT/scripts/carto-chat-vps/" \
  "$HOST:$REMOTE_ROOT/scripts/carto-chat-vps/"

# driver + worker à jour ; secret injecté pour setup
ssh "$HOST" "bash -s" <<EOF
set -euo pipefail
export CARTO_CHAT_VPS_SECRET='$SECRET'
cd '$REMOTE_ROOT'
if [[ ! -f scripts/carto-chat-vps/setup-vps.sh ]]; then
  echo "setup-vps.sh introuvable"; exit 1
fi
bash scripts/carto-chat-vps/setup-vps.sh

# Chrome / Chromium pour CDP (si absent)
if ! command -v google-chrome >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  echo "==> install Chromium"
  apt-get update -qq
  apt-get install -y -qq chromium-browser || apt-get install -y -qq chromium || true
fi

echo ""
echo "OK deploy. Prochaine étape = Chrome + login ChatGPT via VNC Contabo."
echo "Sur le VPS (session VNC / bureau) :"
CHROME=\$(command -v google-chrome || command -v chromium-browser || command -v chromium || echo google-chrome)
echo "  \$CHROME --remote-debugging-port=9222 --user-data-dir=/opt/chatgpt-profile --no-first-run https://chatgpt.com/"
echo "Puis sur ton Mac :"
echo "  CARTO_CHAT_VPS_SSH=$HOST bash scripts/carto-chat-vps/tunnel.sh"
EOF

echo ""
echo "Deploy terminé."
