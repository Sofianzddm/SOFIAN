#!/usr/bin/env bash
# Tunnel Mac → worker Chat outreach (nouveau VPS) sur port local 3848.
# Usage:
#   bash scripts/carto-chat-vps/tunnel-outreach.sh
#   OUTREACH_CHAT_VPS_SSH=root@IP bash scripts/carto-chat-vps/tunnel-outreach.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH_TARGET="${OUTREACH_CHAT_VPS_SSH:-}"

if [[ -z "$SSH_TARGET" && -f "$ROOT/.env.local" ]]; then
  SSH_TARGET="$(grep -E '^OUTREACH_CHAT_VPS_SSH=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
SSH_TARGET="${SSH_TARGET:-root@156.67.103.166}"

if [[ -z "$SSH_TARGET" ]]; then
  echo "Définis OUTREACH_CHAT_VPS_SSH=user@ton-vps"
  exit 1
fi

if lsof -nP -iTCP:3848 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3848 déjà pris :"
  lsof -nP -iTCP:3848 -sTCP:LISTEN || true
fi

echo "Tunnel 127.0.0.1:3848 → $SSH_TARGET:127.0.0.1:3847"
echo "Laisse ce terminal ouvert. Ctrl+C pour couper."
exec ssh -N -o ServerAliveInterval=30 -L 3848:127.0.0.1:3847 "$SSH_TARGET"
