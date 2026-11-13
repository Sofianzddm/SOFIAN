#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm install
npx playwright install chromium
echo "OK — puis:"
echo "  export CARTO_CHAT_CDP_URL=http://127.0.0.1:9222"
echo "  export CARTO_CHAT_VPS_SECRET='…'"
echo "  npm start"
