# 🎯 FILTRES PAR PÔLE - DASHBOARD FINANCE

Date : 27 Janvier 2026

---

## 📋 CONTEXTE

L'agence Glow Up est organisée en **2 pôles** :

### 📱 **Pôle Influence**
- **Équipe** : HEAD_OF_INFLUENCE + TM (Talent Managers)
- **Rôle** : Gestion des collaborations **entrantes** (INBOUND)
- **Source** : Les marques viennent à nous
- **Type de collabs** : INBOUND

### 💼 **Pôle Sales**
- **Équipe** : HEAD_OF_SALES
- **Rôle** : Prospection active et développement commercial
- **Source** : Nous allons vers les marques
- **Type de collabs** : OUTBOUND

---

## ✨ FONCTIONNALITÉ AJOUTÉE

### **Filtres dans le Dashboard Finance**

Boutons de filtrage ajoutés en haut du dashboard :

```
┌────────────────────────────────────────────┐
│ [🎯 Tous] [📱 Pôle Influence] [💼 Pôle Sales] │
└────────────────────────────────────────────┘
```

**3 modes de visualisation :**

1. **🎯 Tous** (par défaut)
   - Affiche TOUTES les collaborations
   - Sources INBOUND + OUTBOUND
   - Vue globale de l'agence

2. **📱 Pôle Influence**
   - Filtre uniquement les collabs **INBOUND**
   - Stats du pôle Influence (HEAD_OF_INFLUENCE + TM)
   - Collaborations entrantes

3. **💼 Pôle Sales**
   - Filtre uniquement les collabs **OUTBOUND**
   - Stats du pôle Sales (HEAD_OF_SALES)
   - Collaborations issues de la prospection

---

## 🔧 MODIFICATIONS TECHNIQUES

### **1. Lib Finance Analytics** (`/src/lib/finance/analytics.ts`)

#### **Interface PeriodeFilter étendue**
```typescript
export interface PeriodeFilter {
  dateDebut: Date;
  dateFin: Date;
  pole?: "INFLUENCE" | "SALES"; // NOUVEAU
}
```

#### **Fonctions modifiées**
- ✅ `getFinanceStats(periode: PeriodeFilter)`
- ✅ `getCAParMois(nbMois, pole?)`
- ✅ `getRepartitionParTalent(periode, limit)`
- ✅ `getRepartitionParMarque(periode, limit)`
- ✅ `getTauxConversion(periode)`

**Filtre appliqué partout :**
```typescript
if (periode.pole === "INFLUENCE") {
  whereClause.source = "INBOUND";
} else if (periode.pole === "SALES") {
  whereClause.source = "OUTBOUND";
}
```

---

### **2. APIs Finance**

#### **API Analytics** (`/api/finance/analytics`)
```typescript
GET /api/finance/analytics?type=mois&pole=INFLUENCE
GET /api/finance/analytics?type=annee&pole=SALES
GET /api/finance/analytics?dateDebut=2026-01-01&dateFin=2026-01-31&pole=INFLUENCE
```

#### **API Evolution** (`/api/finance/evolution`)
```typescript
GET /api/finance/evolution?nbMois=12&pole=INFLUENCE
GET /api/finance/evolution?nbMois=12&pole=SALES
```

#### **API Répartition** (`/api/finance/repartition`)
```typescript
GET /api/finance/repartition?pole=INFLUENCE
GET /api/finance/repartition?type=talent&pole=SALES
```

#### **API Conversion** (`/api/finance/conversion`)
```typescript
GET /api/finance/conversion?pole=INFLUENCE
GET /api/finance/conversion?dateDebut=2026-01-01&dateFin=2026-01-31&pole=SALES
```

**Toutes les APIs acceptent maintenant le paramètre `?pole=INFLUENCE|SALES`**

---

### **3. Dashboard Frontend** (`/src/app/(dashboard)/finance/page.tsx`)

#### **État ajouté**
```typescript
const [poleFilter, setPoleFilter] = useState<"ALL" | "INFLUENCE" | "SALES">("ALL");
```

#### **Fetch avec filtre**
```typescript
const poleParam = poleFilter !== "ALL" ? `&pole=${poleFilter}` : "";

const statsRes = await fetch(`/api/finance/analytics?type=${periodeType}${poleParam}`);
const evolutionRes = await fetch(`/api/finance/evolution?nbMois=12${poleParam}`);
// ... etc
```

#### **Boutons de filtrage**
```tsx
<div className="flex gap-2 bg-gray-100 rounded-lg p-1">
  <button onClick={() => setPoleFilter("ALL")}>
    🎯 Tous
  </button>
  <button onClick={() => setPoleFilter("INFLUENCE")}>
    📱 Pôle Influence
  </button>
  <button onClick={() => setPoleFilter("SALES")}>
    💼 Pôle Sales
  </button>
</div>
```

#### **Indicateur visuel**
```tsx
{poleFilter !== "ALL" && (
  <span className="bg-gradient-to-r from-glowup-rose to-purple-600 text-white px-4 py-1 rounded-full">
    {poleFilter === "INFLUENCE" ? "📱 Pôle Influence (INBOUND)" : "💼 Pôle Sales (OUTBOUND)"}
  </span>
)}
```

---

## 📊 DONNÉES FILTRÉES

Quand un pôle est sélectionné, **TOUTES les métriques** sont filtrées :

### **KPIs**
- ✅ CA Total du pôle
- ✅ CA Payé du pôle
- ✅ CA En Attente du pôle
- ✅ Commissions du pôle
- ✅ Ticket moyen du pôle
- ✅ Nb collaborations du pôle
- ✅ Taux de conversion du pôle

### **Graphiques**
- ✅ Évolution CA (12 mois) filtrée
- ✅ Bar Chart conversions filtré
- ✅ Pie Chart sources (affiche uniquement INBOUND ou OUTBOUND si filtré)
- ✅ Top Talents du pôle
- ✅ Top Marques du pôle

### **Répartitions**
- ✅ Top Talents : Uniquement les talents ayant des collabs du pôle sélectionné
- ✅ Top Marques : Uniquement les marques ayant des collabs du pôle sélectionné
- ✅ Sources : Affiche 100% INBOUND ou 100% OUTBOUND si filtré

---

## 🎯 CAS D'USAGE

### **Scénario 1 : Analyse Pôle Influence**
```
1. Admin ouvre /finance
2. Clic sur "📱 Pôle Influence"
3. Dashboard affiche :
   - CA des collabs INBOUND uniquement
   - Top talents du pôle Influence
   - Évolution CA Influence sur 12 mois
   - Taux de conversion des négos INBOUND
```

### **Scénario 2 : Comparaison des pôles**
```
1. Ouvrir /finance → Voir "🎯 Tous" → CA Total = 250k€
2. Clic "📱 Pôle Influence" → CA Influence = 180k€ (72%)
3. Clic "💼 Pôle Sales" → CA Sales = 70k€ (28%)
4. Conclusion : Le pôle Influence génère 72% du CA
```

### **Scénario 3 : Analyse mensuelle par pôle**
```
1. Sélectionner "📱 Pôle Influence"
2. Sélectionner "Mois en cours"
3. Voir KPIs du mois pour le pôle Influence
4. Exporter Excel avec filtres appliqués
```

---

## 🎨 UI/UX

### **Boutons de filtrage**
- **Style** : Groupe de 3 boutons avec fond gris clair
- **Actif** : Fond blanc + ombre
- **Inactif** : Transparent + hover gris
- **Position** : En haut à gauche du dashboard

### **Badge indicateur**
- **Quand** : Un pôle est sélectionné (pas "Tous")
- **Style** : Gradient rose → violet
- **Texte** : Nom du pôle + type (INBOUND/OUTBOUND)
- **Position** : À côté du titre "Finance & Analytics"

### **Description dynamique**
```
Tous      → "Dashboard financier complet - Tous les pôles"
Influence → "Vue du Pôle Influence (HEAD_OF_INFLUENCE + TM) - Collaborations entrantes"
Sales     → "Vue du Pôle Sales (HEAD_OF_SALES) - Prospection et collaborations sortantes"
```

---

## ✅ AVANTAGES

### **Pour les dirigeants**
- ✅ Comparer la performance des 2 pôles
- ✅ Identifier le pôle le plus rentable
- ✅ Allouer les ressources efficacement
- ✅ Suivre les objectifs par pôle

### **Pour HEAD_OF_INFLUENCE**
- ✅ Voir uniquement les stats de son pôle
- ✅ Top talents INBOUND
- ✅ Marques récurrentes INBOUND
- ✅ Taux de conversion INBOUND

### **Pour HEAD_OF_SALES**
- ✅ Voir uniquement les stats de prospection
- ✅ Top talents OUTBOUND
- ✅ Marques converties OUTBOUND
- ✅ ROI prospection

---

## 🚀 UTILISATION

### **Accéder au dashboard**
```
1. Se connecter en tant qu'ADMIN
2. Menu latéral > Finance (💰)
3. URL : /finance
```

### **Filtrer par pôle**
```
1. Cliquer sur un des 3 boutons :
   - 🎯 Tous (vue globale)
   - 📱 Pôle Influence (INBOUND)
   - 💼 Pôle Sales (OUTBOUND)

2. Toutes les données se mettent à jour automatiquement

3. Combiner avec filtres dates :
   - Mois en cours + Pôle Influence
   - Année en cours + Pôle Sales
   - Custom dates + Tous
```

### **Exporter avec filtre**
```
1. Sélectionner un pôle
2. Cliquer "Export Excel" ou "Export CSV"
3. Le fichier contient uniquement les données du pôle sélectionné
```

---

## 📦 FICHIERS MODIFIÉS

```
✅ /src/lib/finance/analytics.ts
   → Interface PeriodeFilter étendue
   → Toutes les fonctions acceptent pole?: "INFLUENCE" | "SALES"

✅ /src/app/api/finance/analytics/route.ts
   → Paramètre ?pole=INFLUENCE|SALES

✅ /src/app/api/finance/evolution/route.ts
   → Paramètre ?pole=INFLUENCE|SALES

✅ /src/app/api/finance/repartition/route.ts
   → Paramètre ?pole=INFLUENCE|SALES

✅ /src/app/api/finance/conversion/route.ts
   → Paramètre ?pole=INFLUENCE|SALES

✅ /src/app/(dashboard)/finance/page.tsx
   → État poleFilter
   → Boutons de filtrage
   → Indicateur visuel
   → Description dynamique
   → Fetch avec paramètre pole
```

---

## 🎉 RÉSULTAT FINAL

**Dashboard Finance avec filtres par pôle entièrement fonctionnel !**

```
┌──────────────────────────────────────────────────────────┐
│ 📊 Finance & Analytics [📱 Pôle Influence (INBOUND)]     │
│ Vue du Pôle Influence - Collaborations entrantes         │
│                                                           │
│ [🎯 Tous] [📱 Pôle Influence ✓] [💼 Pôle Sales]          │
│ ─────────────────────────────────────────────────────    │
│ [Mois] [Année] [Custom] [Excel] [CSV]                    │
└──────────────────────────────────────────────────────────┘

┌──────────┬──────────┬──────────┬──────────┐
│ CA Total │ CA Payé  │ CA Att.  │ Commiss. │
│ 180k€    │ 125k€    │ 55k€     │ 40k€     │
│ +18.2%   │ 69%      │ 8 fact.  │ 22.2%    │
└──────────┴──────────┴──────────┴──────────┘

📈 Évolution CA Pôle Influence (12 mois)
[Graphique INBOUND uniquement]

🎯 Top Talents Influence | 📱 Top Marques Influence
[Données filtrées INBOUND]
```

**Chaque pôle peut maintenant suivre ses propres performances ! 🚀**
