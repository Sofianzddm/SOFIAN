# 🚀 Guide de démarrage rapide - Press Kit

## ⚡ Setup en 5 minutes

### 1. Variables d'environnement

Copier `.env.example` vers `.env` et remplir:

```bash
cp .env.example .env
```

**Obligatoires:**
- `NEXT_PUBLIC_BASE_URL` - URL de production (ex: https://app.glowupagence.fr)
- `ANTHROPIC_API_KEY` - Pour génération pitchs IA

**Optionnels mais recommandés:**
- `BRANDFETCH_API_KEY` - Pour logos et couleurs automatiques
- `HUBSPOT_API_KEY` - Pour intégration CRM

### 2. Tester en local

```bash
npm run dev
```

Accès: http://localhost:3000

### 3. Générer votre premier press kit

#### Option A: Via API (recommandé pour tester)

```bash
curl -X POST http://localhost:3000/api/presskit/generate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "batchName": "Test Mars 2026",
    "brands": [
      {
        "hubspotId": "test-123",
        "name": "Tezenis",
        "domain": "tezenis.com",
        "niche": "fashion",
        "description": "Marque de lingerie italienne tendance"
      }
    ]
  }'
```

**Résultat:** 
- Press kit accessible sur: http://localhost:3000/book/tezenis
- Visible dans le dashboard: http://localhost:3000/presskit-dashboard

#### Option B: Via Prisma Studio (manuel)

```bash
npx prisma studio
```

1. Créer une `Brand`:
   - name: "Tezenis"
   - slug: "tezenis" (généré auto si vide)
   - domain: "tezenis.com"
   - niche: "fashion"

2. Créer des `PressKitTalent`:
   - Associer 3-5 talents à la marque
   - Remplir le pitch manuellement

3. Accéder: http://localhost:3000/book/tezenis

### 4. Ajouter des Case Studies

**Via Prisma Studio:**

```
CaseStudy:
  title: "Campagne Lingerie Été 2025"
  brandName: "Intimissimi"
  niche: "fashion"
  description: "Campagne réseaux sociaux avec 5 créatrices beauté/fashion"
  impressions: "2.5M"
  engagement: "8.2%"
```

Les case studies s'affichent automatiquement sur les press kits de la même niche.

---

## 🎯 Utilisation en production

### 1. Configuration HubSpot

#### Créer une Private App

1. HubSpot → Settings → Integrations → Private Apps
2. Create private app: "Glow Up Press Kit"
3. Scopes requis:
   - `crm.objects.companies.read`
   - `crm.objects.companies.write`
4. Copier le token → `.env` → `HUBSPOT_API_KEY`

#### Créer un webhook

1. HubSpot → Settings → Data Management → Workflows
2. Create workflow → "Trigger when company is created"
3. Action: Send webhook
   - URL: `https://app.glowupagence.fr/api/webhook/hubspot`
   - Method: POST

**Résultat:** Chaque nouvelle company dans HubSpot = press kit auto-généré

### 2. Utiliser dans les séquences

**Template email HubSpot:**

```
Bonjour {{company.name}},

J'ai préparé une sélection personnalisée de nos meilleurs créateurs 
pour votre marque dans l'univers {{company.industry}}.

👉 Découvrir les profils: {{company.presskit_url}}?cid={{contact.id}}

Je reste disponible pour échanger,

Sofian
Glow Up Agence
```

**Avantages:**
- Chaque marque voit son logo et ses couleurs
- Pitchs personnalisés par IA
- Tracking automatique (qui ouvre, combien de temps, etc.)

### 3. Suivre les leads chauds

**Dashboard:** https://app.glowupagence.fr/presskit-dashboard

**Focus sur:**
- 🔥 **Très intéressé** - CTA cliqué ou 2+ visites → Relancer immédiatement
- 🟢 **Engagé** - >30s ou scroll >50% → Relancer sous 24h
- 🟡 **Vue rapide** - <30s → Relancer dans 1 semaine
- 🔴 **Pas ouvert** - Envoyer follow-up

---

## 📊 Exemples de résultats

### Batch de 200 marques

```bash
curl -X POST https://app.glowupagence.fr/api/presskit/generate-batch \
  -H "Content-Type: application/json" \
  -d @marques.json
```

**Fichier `marques.json`:**
```json
{
  "batchName": "Prospection Mars 2026",
  "brands": [
    { "hubspotId": "123", "name": "Tezenis", "domain": "tezenis.com", "niche": "fashion" },
    { "hubspotId": "456", "name": "Sephora", "domain": "sephora.fr", "niche": "beauty" },
    ...
  ]
}
```

**Temps de génération:** ~5-10 min pour 200 marques

**Résultat attendu:**
```json
{
  "batchId": "clxxx",
  "totalBrands": 200,
  "completed": 198,
  "failed": 2,
  "results": [...]
}
```

### Taux de conversion moyen

Sur 200 prospects:
- **120 ouvrent** le press kit (60%)
- **45 passent >30s** (22.5%)
- **12 reviennent 2+** fois (6%)
- **8 cliquent CTA** (4%) → **Leads chauds**

→ Permet de **prioriser 8-12 marques ultra-intéressées** au lieu de relancer 200

---

## 🐛 Dépannage rapide

### Press kit vide

**Problème:** Aucun talent ne s'affiche

**Solution:**
```sql
-- Vérifier dans Prisma Studio
SELECT * FROM "PressKitTalent" WHERE "brandId" = 'xxx';
```

Si vide → Relancer génération du batch

### Erreur Claude API

**Problème:** `Error: ANTHROPIC_API_KEY not configured`

**Solution:**
1. Créer compte sur https://console.anthropic.com
2. Générer API key
3. Ajouter dans `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
4. Redémarrer le serveur

### Logo/couleurs non récupérés

**Problème:** Logo manquant, couleurs par défaut

**Solution:**
1. Vérifier `BRANDFETCH_API_KEY` dans `.env`
2. Tester manuellement:
   ```bash
   curl -H "Authorization: Bearer YOUR_KEY" \
     https://api.brandfetch.io/v2/brands/tezenis.com
   ```
3. Si marque inconnue → Ajouter logo manuellement via Prisma Studio

### HubSpot webhook ne se déclenche pas

**Vérifications:**
1. URL webhook = `https://app.glowupagence.fr/api/webhook/hubspot` (HTTPS!)
2. Private app créée avec scopes `companies.read` + `companies.write`
3. `HUBSPOT_API_KEY` dans `.env` Vercel
4. Tester manuellement:
   ```bash
   curl -X POST https://app.glowupagence.fr/api/webhook/hubspot \
     -H "Content-Type: application/json" \
     -d '[{"subscriptionType":"company.creation","objectId":"123"}]'
   ```

---

## 📚 Documentation complète

Voir `PRESSKIT_README.md` pour:
- Architecture détaillée
- Schema Prisma complet
- Toutes les API routes
- Personnalisation avancée
- Roadmap

---

## 🎉 C'est parti !

Tu as maintenant tout ce qu'il faut pour générer des press kits automatisés et convertir plus de prospects.

**Prochaines étapes:**
1. ✅ Tester avec 5-10 marques
2. ✅ Analyser les résultats dans le dashboard
3. ✅ Intégrer dans tes séquences HubSpot
4. ✅ Scaler à 200+ marques/semaine

Good luck! 🚀
