#!/usr/bin/env bash
# Crée l’abonnement webhook Qonto (transactions entrantes → Glow Up Platform).
# Usage :
#   export QONTO_API_KEY="login:secret"
#   export QONTO_WEBHOOK_SECRET="$(openssl rand -hex 32)"
#   export CALLBACK_URL="https://app.glowupagence.fr/api/webhooks/qonto"
#   ./scripts/register-qonto-webhook.sh
#
# Copie ensuite QONTO_WEBHOOK_SECRET dans Vercel (Production) et redéploie.

set -euo pipefail

: "${QONTO_API_KEY:?Définir QONTO_API_KEY (login:secret)}"
: "${QONTO_WEBHOOK_SECRET:?Définir QONTO_WEBHOOK_SECRET (32+ caractères)}"
CALLBACK_URL="${CALLBACK_URL:-https://app.glowupagence.fr/api/webhooks/qonto}"

echo "→ Création webhook Qonto → ${CALLBACK_URL}"

curl -sS -X POST "https://thirdparty.qonto.com/v2/webhook_subscriptions" \
  -H "Authorization: ${QONTO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg url "$CALLBACK_URL" \
    --arg secret "$QONTO_WEBHOOK_SECRET" \
    '{
      callback_url: $url,
      types: ["v1/transactions"],
      secret: $secret,
      description: "Glow Up Platform - réconciliation bancaire"
    }')" | jq .

echo ""
echo "✅ Ajoute sur Vercel : QONTO_WEBHOOK_SECRET=${QONTO_WEBHOOK_SECRET}"
