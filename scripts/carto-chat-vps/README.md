# Worker ChatGPT VPS — carto-pipeline2

```
[lab /lab/carto-pipeline2] → CARTO_CHAT_VPS_URL → worker :3847 → Chrome ChatGPT ouvert
```

## Branchement rapide

### A. Sur le VPS (une fois)

```bash
cd /opt/glowup-casting-worker   # ou ton clone du repo
bash scripts/carto-chat-vps/setup-vps.sh
```

Puis **Chrome + login** (VNC) :

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/opt/chatgpt-profile \
  --no-first-run \
  https://chatgpt.com/
```

Laisse Chrome ouvert. Vérif sur le VPS :

```bash
curl -s http://127.0.0.1:3847/health \
  -H "Authorization: Bearer $CARTO_CHAT_VPS_SECRET"
# → loggedIn: true
```

### B. Sur ton Mac (dev)

1. Secret déjà dans `.env.local` (`CARTO_CHAT_VPS_SECRET`)
2. Tunnel :

```bash
CARTO_CHAT_VPS_SSH=user@TON_VPS bash scripts/carto-chat-vps/tunnel.sh
```

3. Redémarre `pnpm dev`
4. Ouvre `/lab/carto-pipeline2` → Générer

### C. Prod (Vercel) — HTTPS public

1. **DNS** (chez ton registrar / Cloudflare) :
   ```
   A  carto-chat.glowupagence.fr  →  IP Contabo (ex. 169.58.229.98)
   ```

2. **Sur le VPS** (une fois) :
   ```bash
   cd /opt/glowup-casting-worker   # ou chemin du repo
   bash scripts/carto-chat-vps/expose-prod.sh
   ```
   → installe Caddy, TLS Let's Encrypt, reverse proxy vers `127.0.0.1:3847`.

3. **Vercel** (Project → Settings → Environment Variables) :
   ```
   CARTO_CHAT_VPS_URL=https://carto-chat.glowupagence.fr
   CARTO_CHAT_VPS_SECRET=<même secret que scripts/carto-chat-vps/.env sur le VPS>
   ```
   Redeploy.

4. **Test** :
   ```bash
   curl -s https://carto-chat.glowupagence.fr/health \
     -H "Authorization: Bearer $CARTO_CHAT_VPS_SECRET"
   ```

Le worker reste bind `127.0.0.1` (pas exposé brut). Auth = Bearer obligatoire.  
Lab `/lab/carto-pipeline2` sur `app.glowupagence.fr` parle alors directement au Contabo.

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | — |
| POST | `/ask` | `Bearer SECRET` |
| POST | `/read-last` | `Bearer SECRET` |

## Notes

- Une requête à la fois.
- Attente UI « Réponse terminée ».
- Si Chat se déconnecte : relog via VNC.
