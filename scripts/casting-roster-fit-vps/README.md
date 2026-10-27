# Worker casting (VPS) — fit + rédaction serveur

Fait tourner en continu sur le VPS (même DB Neon que Vercel) :

1. **Roster fit** (analyse casting marque / talent)
2. **Rédaction outreach** (`CastingOutreachDraftJob`)
3. **Rédaction pipeline indiv** (`CastingIndivDraftJob`)

Tu quittes la page → les jobs avancent sans timeout serverless.

## Prérequis

Sur le VPS (Ubuntu) :

- Node 20+
- pnpm
- pm2 (`npm i -g pm2`)
- Clone du repo (ou sync du code)

## Secrets

Créer `/opt/glowup-casting-worker/.env` (ou `.env` à la racine du clone) :

```bash
DATABASE_URL="postgresql://…neon…"   # même que Vercel
XAI_API_KEY="…"                      # même que Vercel
APP_URL="https://app.glowupagence.fr"  # requis (brand/talent/email)
CRON_SECRET="…"                      # même que Vercel (auth appels internes)
CASTING_FIT_POLL_MS=5000             # optionnel
```

## Install

```bash
# Exemple
sudo mkdir -p /opt/glowup-casting-worker
cd /opt/glowup-casting-worker
# git clone / rsync du repo ici
pnpm install --frozen-lockfile
pnpm exec prisma generate

# Charger l’env
set -a && source .env && set +a

pm2 start scripts/casting-roster-fit-vps/ecosystem.config.cjs
pm2 save
pm2 startup
```

## Côté Vercel

**Obligatoire** (valeur exacte `1`, pas vide) :

```
CASTING_FIT_EXTERNAL_WORKER=1
```

→ l’app crée le job en DB et **laisse le VPS worker le consommer**.

Le cron `/api/cron/casting-roster-fit` (toutes les 2 min) ne gère **que** le fit roster coincé.

Les **rédactions** outreach + indiv sont **uniquement** consommées par ce worker pm2
(`CASTING_FIT_EXTERNAL_WORKER=1` côté Vercel).

## Ops

```bash
pm2 status
pm2 logs casting-roster-fit-worker
pm2 restart casting-roster-fit-worker
```

Jobs parallèles : jusqu’à `CASTING_FIT_MAX_PARALLEL` (défaut 40) jobs actifs, **1 marque / job** par tick.

## Upgrade

```bash
cd /opt/glowup-casting-worker
git pull   # ou rsync
pnpm install --frozen-lockfile
pnpm exec prisma generate
pm2 restart casting-roster-fit-worker
```

Sans ce restart après un pull qui ajoute outreach/indiv draft, les rédactions restent en `pending` à 0/N.
