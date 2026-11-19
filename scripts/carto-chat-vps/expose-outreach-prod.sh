#!/usr/bin/env bash
# Expose le worker Chat outreach (VPS 156.67) en HTTPS pour Vercel / prod.
# À lancer SUR le VPS outreach :
#   bash scripts/carto-chat-vps/expose-outreach-prod.sh
#
# Prérequis DNS (OVH) :
#   A  outreach-chat.glowupagence.fr  →  IP publique du Contabo outreach (156.67.x.x)
set -euo pipefail

HOST_NAME="${OUTREACH_CHAT_PUBLIC_HOST:-outreach-chat.glowupagence.fr}"
DIR="$(cd "$(dirname "$0")" && pwd)"
CADDY_SITE="/etc/caddy/Caddyfile.d/outreach-chat.caddy"

echo "==> Domaine public : https://${HOST_NAME}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Relance en root : sudo bash $0"
  exec sudo env OUTREACH_CHAT_PUBLIC_HOST="$HOST_NAME" bash "$0"
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Install Caddy"
  apt-get update -y
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

mkdir -p /etc/caddy/Caddyfile.d

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

if [[ ! -f /etc/caddy/Caddyfile ]]; then
  echo -e "{\n\temail admin@glowupagence.fr\n}\n\nimport /etc/caddy/Caddyfile.d/*.caddy" \
    > /etc/caddy/Caddyfile
elif ! grep -q 'Caddyfile.d' /etc/caddy/Caddyfile; then
  echo "" >> /etc/caddy/Caddyfile
  echo "import /etc/caddy/Caddyfile.d/*.caddy" >> /etc/caddy/Caddyfile
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

# Worker en local only — Caddy expose le HTTPS (plus sûr que 0.0.0.0:3847)
ENV_FILE="$DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^CARTO_CHAT_VPS_BIND=' "$ENV_FILE"; then
    sed -i 's/^CARTO_CHAT_VPS_BIND=.*/CARTO_CHAT_VPS_BIND=127.0.0.1/' "$ENV_FILE"
  else
    echo 'CARTO_CHAT_VPS_BIND=127.0.0.1' >> "$ENV_FILE"
  fi
  set -a && source "$ENV_FILE" && set +a
  cd "$DIR"
  pm2 restart carto-chat-vps --update-env || true
  sleep 2
fi

echo "==> Reload Caddy"
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  set -a && source "$ENV_FILE" && set +a
  SECRET="${CARTO_CHAT_VPS_SECRET:-}"
fi

IP="$(curl -4 -fsS --max-time 3 ifconfig.me 2>/dev/null || echo 'IP_CONTABO')"

echo ""
echo "=== OUTREACH PROD READY ==="
echo "1) DNS A  ${HOST_NAME}  →  ${IP}"
echo "2) Vercel / .env :"
echo "   OUTREACH_CHAT_VPS_URL=https://${HOST_NAME}"
if [[ -n "$SECRET" ]]; then
  echo "   OUTREACH_CHAT_VPS_SECRET=${SECRET}"
fi
echo "3) Test (après propagation DNS) :"
echo "   curl -s https://${HOST_NAME}/health -H \"Authorization: Bearer \$OUTREACH_CHAT_VPS_SECRET\""
echo ""
