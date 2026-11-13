#!/usr/bin/env bash
# Tunnel Mac → worker Chat sur le VPS (port 3847).
# Usage:
#   bash scripts/carto-chat-vps/tunnel.sh
#   CARTO_CHAT_VPS_SSH=root@IP bash scripts/carto-chat-vps/tunnel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH_TARGET="${CARTO_CHAT_VPS_SSH:-}"

if [[ -z "$SSH_TARGET" && -f "$ROOT/.env.local" ]]; then
  SSH_TARGET="$(grep -E '^CARTO_CHAT_VPS_SSH=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
# Défaut Contabo Glow-up
SSH_TARGET="${SSH_TARGET:-root@169.58.229.98}"

if [[ -z "$SSH_TARGET" ]]; then
  echo "Définis CARTO_CHAT_VPS_SSH=user@ton-vps"
  exit 1
fi

# Libère 3847 si un vieux worker local bloque
if lsof -nP -iTCP:3847 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3847 déjà pris — tue le process local si c'est le vieux worker."
  lsof -nP -iTCP:3847 -sTCP:LISTEN || true
fi

echo "Tunnel 127.0.0.1:3847 → $SSH_TARGET:127.0.0.1:3847"
echo "Laisse ce terminal ouvert. Ctrl+C pour couper."
exec ssh -N -L 3847:127.0.0.1:3847 "$SSH_TARGET"
