#!/usr/bin/env bash
# Relance Chromium CDP si :9222 est down (cron / manuel).
# Usage (sur le VPS) :
#   bash scripts/carto-chat-vps/ensure-chrome-cdp.sh
set -euo pipefail

DISPLAY_NUM="${CARTO_CHAT_DISPLAY:-:1}"
XAUTH="${XAUTHORITY:-/root/.Xauthority}"
PROFILE="${CARTO_CHAT_PROFILE_DIR:-/root/snap/chromium/common/chatgpt-profile}"
BIN="${CARTO_CHAT_CHROME_BIN:-}"
CDP_URL="${CARTO_CHAT_CDP_URL:-http://127.0.0.1:9222}"

if [[ -z "$BIN" ]]; then
  for c in chromium-browser chromium google-chrome; do
    if command -v "$c" >/dev/null 2>&1; then BIN="$c"; break; fi
  done
fi
BIN="${BIN:-chromium-browser}"

if curl -fsS --max-time 3 "${CDP_URL%/}/json/version" >/dev/null 2>&1; then
  echo "CDP OK ($CDP_URL)"
  exit 0
fi

echo "CDP down — spawn $BIN profile=$PROFILE DISPLAY=$DISPLAY_NUM"
mkdir -p "$PROFILE"
pkill -f 'remote-debugging-port=9222' 2>/dev/null || true
sleep 1

export DISPLAY="$DISPLAY_NUM"
export XAUTHORITY="$XAUTH"

nohup "$BIN" \
  --no-sandbox \
  --disable-setuid-sandbox \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --disable-gpu \
  https://chatgpt.com/ \
  >>/tmp/chrome-carto.log 2>&1 &

for i in $(seq 1 20); do
  if curl -fsS --max-time 2 "${CDP_URL%/}/json/version" >/dev/null 2>&1; then
    echo "CDP UP after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "FAIL: CDP toujours down — voir /tmp/chrome-carto.log" >&2
tail -30 /tmp/chrome-carto.log >&2 || true
exit 1
