#!/usr/bin/env bash
# Installe Docker + OnlyOffice + Caddy (HTTPS) sur un VPS Ubuntu 22.04/24.04
# Usage (en root sur le VPS) :
#   curl -fsSL … | bash   OU   bash setup.sh
set -euo pipefail

DOMAIN="${OO_DOMAIN:-office.glowupagence.fr}"
JWT_SECRET="${JWT_SECRET:-}"

if [[ -z "$JWT_SECRET" ]]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  echo "==> JWT_SECRET généré : $JWT_SECRET"
  echo "    → mets la MÊME valeur dans Vercel : ONLYOFFICE_JWT_SECRET"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg

# Docker
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

mkdir -p /opt/onlyoffice
cd /opt/onlyoffice

cat > .env <<EOF
JWT_SECRET=${JWT_SECRET}
EOF

cat > docker-compose.yml <<'EOF'
services:
  onlyoffice:
    image: onlyoffice/documentserver:latest
    container_name: onlyoffice
    restart: unless-stopped
    environment:
      - JWT_ENABLED=true
      - JWT_SECRET=${JWT_SECRET}
      - JWT_HEADER=Authorization
    volumes:
      - oo_data:/var/www/onlyoffice/Data
      - oo_logs:/var/log/onlyoffice
    expose:
      - "80"

  caddy:
    image: caddy:2
    container_name: onlyoffice-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - onlyoffice

volumes:
  oo_data:
  oo_logs:
  caddy_data:
  caddy_config:
EOF

cat > Caddyfile <<EOF
${DOMAIN} {
	encode gzip
	reverse_proxy onlyoffice:80
	header {
		Content-Security-Policy "frame-ancestors https://app.glowupagence.fr http://localhost:3000"
		-Server
	}
}
EOF

docker compose up -d

echo ""
echo "============================================"
echo " OnlyOffice prêt (démarrage ~1–2 min)"
echo " URL  : https://${DOMAIN}"
echo " JWT  : ${JWT_SECRET}"
echo ""
echo " Sur Vercel / .env prod :"
echo "   ONLYOFFICE_URL=https://${DOMAIN}"
echo "   ONLYOFFICE_JWT_SECRET=${JWT_SECRET}"
echo "   NEXT_PUBLIC_BASE_URL=https://app.glowupagence.fr"
echo "============================================"
