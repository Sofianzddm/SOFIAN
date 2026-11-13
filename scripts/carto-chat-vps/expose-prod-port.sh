#!/usr/bin/env bash
# Expose carto-chat en prod SANS toucher au :443 (OnlyOffice Docker).
# Bind worker sur 0.0.0.0:3847 + ufw. Auth = Bearer obligatoire.
#
# Sur le VPS :
#   bash scripts/carto-chat-vps/expose-prod-port.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"
HOST_IP="$(curl -4 -fsS --max-time 3 ifconfig.me 2>/dev/null || echo "169.58.229.98")"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Manque $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1091
set -a && source "$ENV_FILE" && set +a
SECRET="${CARTO_CHAT_VPS_SECRET:-}"
if [[ -z "$SECRET" ]]; then
  echo "CARTO_CHAT_VPS_SECRET vide dans .env"
  exit 1
fi

# Bind public (Vercel → IP:3847). Auth Bearer obligatoire côté worker.
if grep -q '^CARTO_CHAT_VPS_BIND=' "$ENV_FILE"; then
  sed -i 's/^CARTO_CHAT_VPS_BIND=.*/CARTO_CHAT_VPS_BIND=0.0.0.0/' "$ENV_FILE"
else
  echo "CARTO_CHAT_VPS_BIND=0.0.0.0" >> "$ENV_FILE"
fi

# Désactive Caddy s'il combat le :443
systemctl disable --now caddy 2>/dev/null || true

if command -v ufw >/dev/null 2>&1; then
  ufw allow 3847/tcp || true
fi

# Recharge env pm2
export $(grep -v '^#' "$ENV_FILE" | xargs)
cd "$DIR"
pm2 restart carto-chat-vps --update-env
sleep 2

echo ""
echo "=== PROD (port 3847) ==="
echo "Vercel :"
echo "  CARTO_CHAT_VPS_URL=http://${HOST_IP}:3847"
echo "  CARTO_CHAT_VPS_SECRET=${SECRET}"
echo ""
echo "Test :"
echo "  curl -s http://${HOST_IP}:3847/health -H \"Authorization: Bearer ${SECRET}\""
echo ""
echo "Note: HTTP ok (appel serveur→serveur). :443 reste OnlyOffice."
