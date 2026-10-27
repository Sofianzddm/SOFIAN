# Worker casting roster-fit (VPS)

Fait tourner l’analyse casting **en continu** sur le VPS (même DB Neon que Vercel).  
Tu quittes la page → le job avance sans timeout serverless.

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

Ajouter :

```
CASTING_FIT_EXTERNAL_WORKER=1
```

→ l’app crée le job en DB et **laisse le VPS worker le consommer** (plus de dépendance aux ticks serverless).

Le cron `/api/cron/casting-roster-fit` reste un filet si le worker est down.

## Ops

```bash
pm2 status
pm2 logs casting-roster-fit-worker
pm2 restart casting-roster-fit-worker
```

## Upgrade

```bash
cd /opt/glowup-casting-worker
git pull   # ou rsync
pnpm install --frozen-lockfile
pnpm exec prisma generate
pm2 restart casting-roster-fit-worker
```
