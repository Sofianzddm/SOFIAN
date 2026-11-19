#!/usr/bin/env bash
# Redémarre carto-chat-vps SEULEMENT si aucun job Contabo n’est en cours.
# Évite de tuer un mail High mid-run (capture perdue / draft non persisté).
#
# Usage (sur le VPS ou via SSH) :
#   bash scripts/carto-chat-vps/safe-restart-carto-chat.sh
#   bash scripts/carto-chat-vps/safe-restart-carto-chat.sh --wait   # attend idle (max 25 min)
#   bash scripts/carto-chat-vps/safe-restart-carto-chat.sh --force  # ignore busy (DANGER)
#
# Env :
#   CARTO_CHAT_VPS_URL (défaut http://127.0.0.1:3847)
#   CARTO_CHAT_VPS_SECRET
#   PM2_APP (défaut carto-chat-vps)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
WAIT=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --wait) WAIT=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
  esac
done

URL="${CARTO_CHAT_VPS_URL:-http://127.0.0.1:3847}"
URL="${URL%/}"
SECRET="${CARTO_CHAT_VPS_SECRET:-}"
PM2_APP="${PM2_APP:-carto-chat-vps}"
MAX_WAIT_S=$((25 * 60))
POLL_S=15

if [[ -z "$SECRET" && -f "$DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$DIR/.env" && set +a
  SECRET="${CARTO_CHAT_VPS_SECRET:-}"
fi
if [[ -z "$SECRET" ]]; then
  echo "CARTO_CHAT_VPS_SECRET manquant (.env ou env)"
  exit 1
fi

running_count() {
  local json
  json="$(curl -fsS --max-time 8 \
    -H "Authorization: Bearer $SECRET" \
    "$URL/health" 2>/dev/null || echo '{}')"
  # busy | running | outreachRunning | queueLength
  python3 -c "
import json,sys
d=json.loads(sys.argv[1] or '{}')
busy=1 if d.get('busy') else 0
running=int(d.get('running') or d.get('runningCount') or 0)
outreach=int(d.get('outreachRunning') or 0)
queue=int(d.get('queueLength') or 0)
jobs=d.get('jobs') or []
active=sum(1 for j in jobs if str(j.get('state') or '') in ('queued','running'))
print(max(busy, 1 if running else 0, 1 if outreach else 0, 1 if queue else 0, 1 if active else 0), running, outreach, queue, active)
" "$json" 2>/dev/null || echo "1 0 0 0 0"
}

do_restart() {
  echo "==> pm2 restart $PM2_APP (idle OK)"
  pm2 restart "$PM2_APP" --update-env
  pm2 save >/dev/null 2>&1 || true
  echo "OK — $PM2_APP redémarré."
}

if [[ "$FORCE" -eq 1 ]]; then
  echo "WARN --force : restart malgré jobs actifs"
  do_restart
  exit 0
fi

elapsed=0
while true; do
  read -r flag running outreach queue active <<<"$(running_count)"
  if [[ "${flag:-1}" -eq 0 ]]; then
    do_restart
    exit 0
  fi
  echo "BUSY Contabo — running=${running:-?} outreach=${outreach:-?} queue=${queue:-?} activeJobs=${active:-?} (pas de restart mid-run)"
  if [[ "$WAIT" -ne 1 ]]; then
    echo "Relancer avec --wait pour attendre l’idle, ou --force (danger)."
    exit 2
  fi
  if [[ "$elapsed" -ge "$MAX_WAIT_S" ]]; then
    echo "Timeout ${MAX_WAIT_S}s — toujours busy. Abandon."
    exit 3
  fi
  sleep "$POLL_S"
  elapsed=$((elapsed + POLL_S))
done
