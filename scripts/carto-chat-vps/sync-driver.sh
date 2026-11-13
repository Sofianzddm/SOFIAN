#!/usr/bin/env bash
# Met à jour driver + worker + restart pm2 (rapide).
# Mot de passe SSH une seule fois (ControlMaster).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${CARTO_CHAT_VPS_SSH:-root@169.58.229.98}"
REMOTE="/opt/glowup-casting-worker/scripts/carto-chat-vps"
CTRL="/tmp/carto-chat-vps-ssh-%C"
export RSYNC_RSH="ssh -o ControlMaster=auto -o ControlPath=${CTRL} -o ControlPersist=10m"

# Établit le multiplex (1 mot de passe)
ssh -o ControlMaster=auto -o ControlPath="$CTRL" -o ControlPersist=10m "$HOST" "true"

rsync -avz \
  "$ROOT/scripts/carto-chat-vps/chatgpt-driver.mjs" \
  "$ROOT/scripts/carto-chat-vps/worker.mjs" \
  "$HOST:$REMOTE/"

ssh -o ControlPath="$CTRL" "$HOST" \
  "pm2 restart carto-chat-vps && sleep 2 && curl -s http://127.0.0.1:3847/health; echo; pm2 logs carto-chat-vps --lines 12 --nostream"
