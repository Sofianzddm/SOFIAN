#!/usr/bin/env bash
# Expose le worker carto-chat en HTTPS (Caddy) pour Vercel / prod.
# À lancer SUR le VPS (une fois) :
#   bash scripts/carto-chat-vps/expose-prod.sh
#
# Prérequis DNS :
#   A  carto-chat.glowupagence.fr  →  IP publique du Contabo
set -euo pipefail

HOST_NAME="${CARTO_CHAT_PUBLIC_HOST:-carto-chat.glowupagence.fr}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(cd "$(dirname "$0")" && pwd)"
CADDY_DIR="/etc/caddy"
CADDY_SITE="/etc/caddy/Caddyfile.d/carto-chat.caddy"

echo "==> Domaine public : https://${HOST_NAME}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Relance en root : sudo bash $0"
  exec sudo env CARTO_CHAT_PUBLIC_HOST="$HOST_NAME" bash "$0"
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Install Caddy"
  apt-get update -y
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

mkdir -p /etc/caddy/Caddyfile.d

# Site file
cat > "$CADDY_SITE" <<EOF
${HOST_NAME} {
	encode gzip
	reverse_proxy 127.0.0.1:3847 {
		transport http {
			response_header_timeout 15m
			read_timeout 15m
			write_timeout 15m
		}
	}
	header {
		X-Robots-Tag "noindex, nofollow"
		-Server
	}
}
EOF

# Assure un Caddyfile principal qui importe Caddyfile.d
if [[ ! -f /etc/caddy/Caddyfile ]]; then
  echo -e "{\n\temail admin@glowupagence.fr\n}\n\nimport /etc/caddy/Caddyfile.d/*.caddy" \
    > /etc/caddy/Caddyfile
elif ! grep -q 'Caddyfile.d' /etc/caddy/Caddyfile; then
  echo "" >> /etc/caddy/Caddyfile
  echo "import /etc/caddy/Caddyfile.d/*.caddy" >> /etc/caddy/Caddyfile
fi

# Firewall
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

echo "==> Reload Caddy"
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

# Vérifie worker local
if curl -fsS --max-time 3 http://127.0.0.1:3847/health >/dev/null; then
  echo "Worker local OK (127.0.0.1:3847)"
else
  echo "WARN: worker pas joignable en local — pm2 status carto-chat-vps ?"
fi

SECRET=""
if [[ -f "$DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$DIR/.env" && set +a
  SECRET="${CARTO_CHAT_VPS_SECRET:-}"
fi

echo ""
echo "=== PROD READY ==="
echo "1) DNS A  ${HOST_NAME}  →  $(curl -4 -fsS --max-time 3 ifconfig.me 2>/dev/null || echo 'IP_CONTABO')"
echo "2) Vercel / .env prod :"
echo "   CARTO_CHAT_VPS_URL=https://${HOST_NAME}"
if [[ -n "$SECRET" ]]; then
  echo "   CARTO_CHAT_VPS_SECRET=${SECRET}"
else
  echo "   CARTO_CHAT_VPS_SECRET=<même secret que scripts/carto-chat-vps/.env>"
fi
echo "3) Test :"
echo "   curl -s https://${HOST_NAME}/health -H \"Authorization: Bearer \$CARTO_CHAT_VPS_SECRET\""
echo ""
echo "Repo ref: $ROOT"
