#!/usr/bin/env bash
# Met à jour driver + worker + restart pm2 (rapide).
# Mot de passe SSH une seule fois (ControlMaster).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Outreach Contabo = OUTREACH_CHAT_VPS_SSH (défaut 156.67…) + /opt/glowup-outreach-chat
# Carto Contabo = CARTO_CHAT_VPS_SSH (169.58…) + /opt/glowup-casting-worker
HOST="${OUTREACH_CHAT_VPS_SSH:-${CARTO_CHAT_VPS_SSH:-root@156.67.103.166}}"
if [[ "$HOST" == *"156.67"* ]] || [[ "${SYNC_TARGET:-}" == "outreach" ]]; then
  REMOTE="/opt/glowup-outreach-chat/scripts/carto-chat-vps"
else
  REMOTE="${CARTO_CHAT_VPS_REMOTE:-/opt/glowup-casting-worker/scripts/carto-chat-vps}"
fi
CTRL="/tmp/carto-chat-vps-ssh-%C"
export RSYNC_RSH="ssh -o ControlMaster=auto -o ControlPath=${CTRL} -o ControlPersist=10m"

# Établit le multiplex (1 mot de passe)
ssh -o ControlMaster=auto -o ControlPath="$CTRL" -o ControlPersist=10m "$HOST" "true"

rsync -avz \
  "$ROOT/scripts/carto-chat-vps/chatgpt-driver.mjs" \
  "$ROOT/scripts/carto-chat-vps/worker.mjs" \
  "$ROOT/scripts/carto-chat-vps/ecosystem.config.cjs" \
  "$HOST:$REMOTE/"

ssh -o ControlPath="$CTRL" "$HOST" \
  "cd $REMOTE && pm2 startOrReload ecosystem.config.cjs --update-env && sleep 2 && curl -s http://127.0.0.1:3847/health; echo; pm2 logs carto-chat-vps --lines 12 --nostream"
