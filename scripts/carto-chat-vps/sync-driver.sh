#!/usr/bin/env bash
# Met à jour driver + worker + restart pm2 (rapide).
# Mot de passe SSH une seule fois (ControlMaster).
#
# Obligatoire — pas de fallback croisé carto ↔ outreach :
#   SYNC_TARGET=outreach  → OUTREACH_CHAT_VPS_SSH (défaut 156.67…) + /opt/glowup-outreach-chat
#   SYNC_TARGET=carto     → CARTO_CHAT_VPS_SSH (169.58…) + /opt/glowup-casting-worker
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

TARGET="${SYNC_TARGET:-}"
if [[ "$TARGET" != "outreach" && "$TARGET" != "carto" ]]; then
  echo "SYNC_TARGET=outreach|carto requis (pas de VPS ambigu)" >&2
  exit 1
fi

if [[ "$TARGET" == "outreach" ]]; then
  HOST="${OUTREACH_CHAT_VPS_SSH:-root@156.67.103.166}"
  REMOTE="/opt/glowup-outreach-chat/scripts/carto-chat-vps"
else
  HOST="${CARTO_CHAT_VPS_SSH:-root@169.58.229.98}"
  REMOTE="${CARTO_CHAT_VPS_REMOTE:-/opt/glowup-casting-worker/scripts/carto-chat-vps}"
fi

CTRL="/tmp/carto-chat-vps-ssh-${TARGET}-%C"
export RSYNC_RSH="ssh -o ControlMaster=auto -o ControlPath=${CTRL} -o ControlPersist=10m"

echo "→ sync $TARGET → $HOST:$REMOTE"

# Établit le multiplex (1 mot de passe)
ssh -o ControlMaster=auto -o ControlPath="$CTRL" -o ControlPersist=10m "$HOST" "true"

rsync -avz \
  "$ROOT/scripts/carto-chat-vps/chatgpt-driver.mjs" \
  "$ROOT/scripts/carto-chat-vps/worker.mjs" \
  "$ROOT/scripts/carto-chat-vps/ecosystem.config.cjs" \
  "$HOST:$REMOTE/"

ssh -o ControlPath="$CTRL" "$HOST" \
  "cd $REMOTE && pm2 startOrReload ecosystem.config.cjs --update-env && sleep 2 && curl -s http://127.0.0.1:3847/health; echo; pm2 logs carto-chat-vps --lines 12 --nostream"
