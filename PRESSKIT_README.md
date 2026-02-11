# 📚 Système de Press Kit Automatisé - Glow Up Agence

## 🎯 Vue d'ensemble

Système complet de génération automatique de landing pages personnalisées (press kits) pour la prospection de marques. Chaque marque reçoit un lien vers une page unique avec:
- Logo et couleurs de la marque (récupérés automatiquement)
- Sélection de talents pertinents selon la niche
- Descriptions de vente personnalisées générées par IA
- Case studies dans le même secteur
- Tracking analytics complet

## 🏗️ Architecture

### Routes principales

#### 1. `/book/[slug]` - Landing page personnalisée
Page dynamique Next.js qui affiche le press kit pour chaque marque.

**Exemple:** `https://app.glowupagence.fr/book/tezenis`

**Features:**
- Design dark élégant avec couleurs de la marque
- Hero section avec logos Glow Up × Marque
- Barre de stats (créateurs, reach, engagement)
- Cards talents avec photos, métriques, pitchs IA
- Case studies similaires
- CTA mailto + tracking
- Mobile responsive

#### 2. `/presskit-dashboard` - Dashboard BizDev
Dashboard protégé pour suivre l'engagement des marques.

**Features:**
- Liste des batches générés
- Statuts visuels par marque:
  - 🔴 Pas ouvert
  - 🟡 Ouvert < 30 sec
  - 🟢 Ouvert > 30 sec, a regardé des talents
  - 🔥 Revenu 2+ fois ou cliqué CTA
- Métriques détaillées (durée, scroll, talents vus)
- Filtres par statut

### API Routes

#### 1. `GET /api/presskit/[slug]`
Récupère les données du press kit pour une marque.

**Response:**
```json
{
  "name": "Tezenis",
  "logo": "https://...",
  "primaryColor": "#ff0000",
  "secondaryColor": "#000000",
  "niche": "fashion",
  "talents": [...],
  "caseStudies": [...]
}
```

#### 2. `POST /api/presskit/generate-batch`
Génère les press kits pour un batch de marques.

**Request:**
```json
{
  "batchName": "Prospection Mars 2026",
  "brands": [
    {
      "hubspotId": "123456",
      "name": "Tezenis",
      "domain": "tezenis.com",
      "niche": "fashion",
      "description": "Marque de lingerie italienne"
    }
  ]
}
```

**Response:**
```json
{
  "batchId": "clxxx",
  "totalBrands": 200,
  "completed": 198,
  "failed": 2,
  "results": [...]
}
```

**Process:**
1. Traitement par paquets de 20 (rate limiting)
2. Pour chaque marque:
   - Récupération logo + couleurs via Brandfetch
   - Sélection de 5 talents par niche
   - Génération pitchs via Claude API
   - Mise à jour HubSpot avec `presskit_url`
3. Création d'un Batch avec suivi temps réel

#### 3. `POST /api/track`
Tracking des événements sur les press kits.

**Events:**
- `view` - Ouverture de la page
- `session_end` - Fin de session (durée, scroll, talents vus)
- `cta_click` - Clic sur le CTA

#### 4. `GET /api/presskit/batches`
Liste des batches générés.

#### 5. `GET /api/presskit/analytics`
Analytics par marque avec statuts d'engagement.

#### 6. `POST /api/webhook/hubspot`
Webhook HubSpot pour génération automatique.

**Trigger:** Quand une company est ajoutée dans HubSpot
**Action:** Génère automatiquement le press kit

## 🗄️ Schema Prisma

### Modèles ajoutés

```prisma
model Brand {
  id              String
  name            String
  slug            String @unique
  domain          String?
  niche           String
  hubspotId       String? @unique
  description     String?
  logo            String?
  primaryColor    String?
  secondaryColor  String?
  presskitTalents PressKitTalent[]
  pageViews       PageView[]
  batches         BatchBrand[]
}

model PressKitTalent {
  brand     Brand
  talent    Talent
  pitch     String @db.Text // Généré par Claude
  order     Int
}

model CaseStudy {
  title       String
  brandName   String
  niche       String
  description String
  impressions String?
  engagement  String?
  imageUrl    String?
}

model PageView {
  brand              Brand
  sessionId          String
  hubspotContactId   String?
  durationSeconds    Int
  scrollDepthPercent Int
  talentsViewed      String[]
  visitNumber        Int
  ctaClicked         Boolean
}

model Batch {
  name        String
  status      String // processing, completed, failed
  totalBrands Int
  completed   Int
  failed      Int
  brands      BatchBrand[]
}

model BatchBrand {
  batch   Batch
  brand   Brand
  status  String // pending, generating, completed, failed
  error   String?
}
```

## 🔧 Configuration

### Variables d'environnement

```env
# Base
NEXT_PUBLIC_BASE_URL=https://app.glowupagence.fr

# Brandfetch (logo + couleurs)
BRANDFETCH_API_KEY=your_api_key

# Claude API (génération pitchs)
ANTHROPIC_API_KEY=your_api_key

# HubSpot (CRM + webhook)
HUBSPOT_API_KEY=your_private_app_token
```

### Dépendances installées

```bash
npm install @anthropic-ai/sdk @hubspot/api-client
```

## 🚀 Utilisation

### 1. Génération manuelle (via API)

```bash
curl -X POST https://app.glowupagence.fr/api/presskit/generate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "batchName": "Prospection Février 2026",
    "brands": [
      {
        "hubspotId": "123456",
        "name": "Tezenis",
        "domain": "tezenis.com",
        "niche": "fashion",
        "description": "Marque de lingerie italienne"
      }
    ]
  }'
```

### 2. Génération automatique (webhook HubSpot)

**Configuration HubSpot:**

1. Créer une Private App
2. Créer un webhook:
   - URL: `https://app.glowupagence.fr/api/webhook/hubspot`
   - Events: `company.creation`
3. Le press kit est généré automatiquement
4. Le champ `presskit_url` est mis à jour sur la company

### 3. Utilisation dans les séquences HubSpot

**Dans vos emails de prospection:**

```
Bonjour {{company.name}},

J'ai préparé une sélection personnalisée de créateurs pour votre marque:
{{company.presskit_url}}?cid={{contact.id}}

Au plaisir d'échanger,
Sofian
```

**Le paramètre `?cid={{contact.id}}` permet:**
- De tracker le contact HubSpot
- De compter les visites multiples
- D'identifier les prospects chauds

## 📊 Analytics & Tracking

### Tracking automatique

Sur chaque press kit, tracking de:
- ✅ Ouverture de la page
- ✅ Temps passé (en secondes)
- ✅ Profondeur de scroll (%)
- ✅ Talents vus (intersection observer)
- ✅ Nombre de visites
- ✅ Clic sur le CTA

### Statuts d'engagement

**🔴 Pas ouvert** - 0 vue

**🟡 Vue rapide** - Ouvert < 30 sec

**🟢 Engagé** - Ouvert > 30 sec OU scroll > 50%

**🔥 Très intéressé** - CTA cliqué OU 2+ visites

### Dashboard BizDev

Accès: `/presskit-dashboard`

**Filtres:**
- Tous
- 🔥 Priorités (hot + engaged)
- 🔥 Très intéressé
- 🟢 Engagé

**Tri automatique:** Hot → Engaged → Quick view → Not opened

## 🎨 Personnalisation

### Brandfetch API

Récupère automatiquement:
- Logo de la marque (format PNG prioritaire)
- Couleur primaire (#hex)
- Couleur secondaire (#hex)

Les couleurs sont appliquées via CSS variables pour:
- Accents du titre
- Bordures des badges talents
- Couleur du bouton CTA
- Statistiques en couleur

### Claude API

**Prompt utilisé:**

```
Tu es le directeur commercial de Glow Up Agence.
Rédige un pitch de vente de 3 lignes maximum pour présenter ce talent à [Marque].

RÈGLES:
- Utilise UNIQUEMENT les données fournies (followers, engagement, niches)
- N'invente AUCUN chiffre
- Explique pourquoi ce profil est un match parfait pour cette marque
- Ton: professionnel mais chaleureux
- Français uniquement
```

**Modèle:** `claude-sonnet-4-5-20250514` (Claude Sonnet 4.5)

## 🔒 Sécurité & Rate Limiting

### Batch processing

- Traitement par paquets de 20 marques max
- `Promise.allSettled` pour gérer les échecs
- Retry automatique (à implémenter si besoin)

### Rate limits API

- **Brandfetch:** 1000 req/mois (plan gratuit)
- **Claude:** Selon plan (recommandé: tier 2+)
- **HubSpot:** 100 req/10s (respecté via batching)

## 📈 Performances

### ISR (Incremental Static Regeneration)

La page `/book/[slug]` utilise ISR avec `revalidate: 3600` (1h) pour:
- Génération statique à la première visite
- Cache CDN Vercel
- Regénération toutes les heures si données modifiées

### Optimisations

- ✅ Images Next.js avec lazy loading
- ✅ Intersection Observer pour talents vus
- ✅ Tracking en batch (session_end uniquement)
- ✅ Animations CSS au scroll
- ✅ Mobile-first responsive

## 🐛 Troubleshooting

### Press kit vide ou erreur 404

**Causes possibles:**
- Slug invalide (vérifier la table `Brand`)
- Marque non générée
- Talents non associés

**Solution:**
Regénérer le batch ou créer manuellement via Prisma Studio.

### Brandfetch retourne null

**Causes possibles:**
- Domaine invalide
- Marque inconnue de Brandfetch
- Quota API dépassé

**Solution:**
Les couleurs par défaut sont appliquées (#ff6b9d, #c2185b).

### Claude API timeout

**Causes possibles:**
- Prompt trop long
- Rate limit dépassé
- API key invalide

**Solution:**
Un pitch par défaut est créé si Claude échoue.

### HubSpot webhook ne fonctionne pas

**Vérifications:**
1. URL webhook correcte
2. Private app avec permissions `crm.objects.companies.write`
3. Variable `HUBSPOT_API_KEY` configurée
4. Event type = `company.creation`

## 🚀 Roadmap

### Améliorations futures

- [ ] Ajout champ `frAudience` et `ageRange` au modèle Talent
- [ ] Meilleure sélection de collaborations passées
- [ ] Upload manuel de case studies
- [ ] Export PDF du press kit
- [ ] Envoi automatique par email depuis HubSpot
- [ ] A/B testing des pitchs Claude
- [ ] Multi-langue (EN/FR automatique)
- [ ] Intégration Zapier pour autres CRM

## 📞 Support

Pour toute question sur le système Press Kit:
1. Consulter ce README
2. Vérifier les logs dans Vercel
3. Tester l'API manuellement via Postman
4. Consulter Prisma Studio pour debug base de données

---

**Développé pour Glow Up Agence — THE RISE of IDEAS** 🚀
