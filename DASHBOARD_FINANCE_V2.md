# 💰 DASHBOARD FINANCE PRO V2 - ULTRA-COMPLET

Date : 27 Janvier 2026

---

## 🎯 OBJECTIF

Dashboard financier **niveau expert-comptable+** avec toutes les fonctionnalités avancées.

---

## ✅ FONCTIONNALITÉS AJOUTÉES

### **1️⃣ Taux de Conversion**

**API :** `GET /api/finance/conversion`

**Métriques :**
- Nombre de négociations
- Nombre validées / refusées
- Nombre de collaborations créées
- **Taux de validation** : % négos validées
- **Taux de refus** : % négos refusées
- **Taux de conversion** : % négos → collabs

```typescript
{
  nbNegociations: 45,
  nbValidees: 32,
  nbRefusees: 13,
  nbCollaborations: 28,
  tauxValidation: 71.1,
  tauxRefus: 28.9,
  tauxConversion: 62.2
}
```

---

### **2️⃣ Prévisions CA**

**API :** `GET /api/finance/prevision`

**Calculs :**
- **CA Prévisionnel** : Somme des négos en cours (`statut = SOUMISE`)
- **CA En Cours** : Collabs gagnées mais pas encore payées
- **CA Total Prévu** : Prévisionnel + En Cours

```typescript
{
  caPrevisionnel: 125450,    // Négos SOUMISE
  nbNegosEnCours: 12,
  caEnCours: 89320,          // Collabs GAGNE/EN_COURS/etc
  nbCollabsEnCours: 23,
  caTotal: 214770
}
```

**Affichage :**
```
┌────────────────────────────────────┐
│ 📈 PRÉVISIONS CA                   │
│                                     │
│ CA Prévisionnel    125 450€  (12)  │
│ CA En Cours         89 320€  (23)  │
│ ─────────────────────────────────  │
│ TOTAL PRÉVU        214 770€        │
└────────────────────────────────────┘
```

---

### **3️⃣ Export Excel/CSV**

**API :** `POST /api/finance/export`

**Body :**
```json
{
  "format": "excel" | "csv",
  "dateDebut": "2026-01-01",
  "dateFin": "2026-01-31"
}
```

**Fichiers Excel générés :**
- ✅ Feuille "KPIs Globaux" (tous les indicateurs)
- ✅ Feuille "Évolution CA" (12 mois)
- ✅ Feuille "Top Talents" (Top 20 avec %)
- ✅ Feuille "Top Marques" (Top 20 avec %)
- ✅ **Formatage professionnel** (couleurs Glow Up, €, %)
- ✅ **Graphiques automatiques** (via ExcelJS)

**Utilisation frontend :**
```typescript
const exportExcel = async () => {
  const res = await fetch("/api/finance/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      format: "excel",
      dateDebut,
      dateFin,
    }),
  });

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapport-finance-${new Date().toISOString().split("T")[0]}.xlsx`;
  a.click();
};
```

---

### **4️⃣ Graphiques Recharts Interactifs**

**Packages installés :**
```bash
✅ recharts
✅ exceljs
✅ date-fns
```

**Graphiques disponibles :**

#### **A. Line Chart - Évolution CA**
```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={evolution}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="moisLabel" />
    <YAxis />
    <Tooltip formatter={(value) => formatMoney(value)} />
    <Legend />
    <Line 
      type="monotone" 
      dataKey="caHT" 
      stroke="#EA4C89" 
      strokeWidth={2}
      name="CA HT"
    />
    <Line 
      type="monotone" 
      dataKey="commissions" 
      stroke="#9333EA" 
      strokeWidth={2}
      name="Commissions"
    />
  </LineChart>
</ResponsiveContainer>
```

#### **B. Bar Chart - CA par Mois**
```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

<BarChart data={evolution}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="moisLabel" />
  <YAxis />
  <Tooltip formatter={(value) => formatMoney(value)} />
  <Bar dataKey="caHT" fill="#EA4C89" name="CA HT" />
  <Bar dataKey="commissions" fill="#9333EA" name="Commissions" />
</BarChart>
```

#### **C. Pie Chart - Répartition Sources**
```tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#10B981", "#3B82F6"];

<PieChart>
  <Pie
    data={repartitions.sources}
    dataKey="value"
    nameKey="label"
    cx="50%"
    cy="50%"
    outerRadius={80}
    label
  >
    {repartitions.sources.map((entry, index) => (
      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
    ))}
  </Pie>
  <Tooltip formatter={(value) => formatMoney(value)} />
  <Legend />
</PieChart>
```

---

### **5️⃣ Filtres Dates Personnalisées**

**Interface :**
```tsx
<div className="flex gap-3">
  <input
    type="date"
    value={dateDebut}
    onChange={(e) => setDateDebut(e.target.value)}
    className="px-4 py-2 rounded-lg border"
  />
  <input
    type="date"
    value={dateFin}
    onChange={(e) => setDateFin(e.target.value)}
    className="px-4 py-2 rounded-lg border"
  />
  <button
    onClick={fetchData}
    className="px-4 py-2 bg-glowup-rose text-white rounded-lg"
  >
    Appliquer
  </button>
</div>
```

**Périodes prédéfinies :**
```tsx
const periodes = [
  { label: "7 derniers jours", getDates: () => ({ ... }) },
  { label: "30 derniers jours", getDates: () => ({ ... }) },
  { label: "Ce mois", getDates: () => ({ ... }) },
  { label: "Mois dernier", getDates: () => ({ ... }) },
  { label: "Ce trimestre", getDates: () => ({ ... }) },
  { label: "Cette année", getDates: () => ({ ... }) },
];
```

---

### **6️⃣ Alertes Automatiques**

**KPI avec alerte si > seuil :**
```tsx
{stats.nbFacturesRetard > 0 && (
  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
    <div className="flex items-center gap-3">
      <AlertTriangle className="w-6 h-6 text-red-600" />
      <div>
        <p className="font-bold text-red-900">
          ⚠️ {stats.nbFacturesRetard} facture(s) en retard !
        </p>
        <p className="text-sm text-red-700">
          Action requise : relancer les clients
        </p>
      </div>
    </div>
  </div>
)}
```

**Alertes disponibles :**
- ⚠️ Factures en retard
- ⚠️ CA inférieur à l'objectif
- ⚠️ Baisse vs période précédente
- ⚠️ Taux de conversion faible
- ⚠️ Délai paiement élevé

---

## 📦 FICHIERS CRÉÉS/MODIFIÉS

```
✅ /src/lib/finance/analytics.ts
   → getTauxConversion()
   → getPrevisionCA()

✅ /src/lib/finance/export.ts
   → generateExcelReport()
   → generateCSV()

✅ /src/app/api/finance/conversion/route.ts
✅ /src/app/api/finance/prevision/route.ts
✅ /src/app/api/finance/export/route.ts

✅ /src/app/(dashboard)/finance/page.tsx
   → Version V2 avec toutes les features
```

---

## 🎨 DASHBOARD COMPLET V2

### **Layout Final**

```
┌────────────────────────────────────────────────────────┐
│  📊 Finance & Analytics                    [Filtres]   │
│  [7j] [30j] [Ce mois] [Custom: 01/01 - 31/01] [Excel] │
└────────────────────────────────────────────────────────┘

┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ CA Total │ CA Payé  │ CA Att.  │ Commiss. │ CA Prévi │
│ 125k€    │ 89k€     │ 36k€     │ 28k€     │ 215k€    │
│ +15.2%   │ 71%      │ 12 fact. │ 22.4%    │ 35 négos │
└──────────┴──────────┴──────────┴──────────┴──────────┘

⚠️ 3 FACTURES EN RETARD ! Action requise

┌────────────────────────────────────────────────────────┐
│  📈 ÉVOLUTION CA (12 MOIS)                             │
│  [Line Chart interactif Recharts]                      │
│  → Hover pour voir détails                             │
│  → Clic pour zoom                                      │
└────────────────────────────────────────────────────────┘

┌─────────────────┬─────────────────┬─────────────────┐
│ 🎯 CONVERSIONS  │ 📈 PRÉVISIONS   │ 🎨 SOURCES      │
│                 │                 │                 │
│ Négos: 45       │ CA Prévi: 125k€ │ [Pie Chart]     │
│ Validées: 32    │ CA Cours: 89k€  │ INBOUND 68%     │
│ Taux: 71.1%     │ TOTAL: 215k€    │ OUTBOUND 32%    │
│ [Bar Chart]     │                 │                 │
└─────────────────┴─────────────────┴─────────────────┘

┌──────────────┬──────────────┬──────────────┐
│ Top Talents  │ Top Marques  │ Délais       │
│ [Table]      │ [Table]      │ [Histogram]  │
└──────────────┴──────────────┴──────────────┘

[📤 Export Excel] [📄 Export CSV] [📊 Export PDF]
```

---

## 🚀 UTILISATION

### **1. Accéder au dashboard**
```
Sidebar > Finance (💰) → /finance
```

### **2. Filtrer par période**
- Cliquer sur "7j", "30j", "Ce mois", etc.
- OU sélectionner dates custom + Appliquer

### **3. Explorer les graphiques**
- **Hover** : Voir valeurs exactes
- **Clic** : Zoom / Détails
- **Légende** : Masquer/afficher séries

### **4. Exporter**
- Cliquer "Export Excel" → Téléchargement .xlsx
- Cliquer "Export CSV" → Téléchargement .csv

### **5. Alertes**
- Surveiller les alertes rouges en haut
- Cliquer pour voir détails

---

## 🎓 EXEMPLES INTEGRATION

### **Dans la page finance :**

```tsx
"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie ... } from "recharts";

export default function FinancePage() {
  const [stats, setStats] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [prevision, setPrevision] = useState(null);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const fetchData = async () => {
    const [statsRes, conversionRes, previsionRes] = await Promise.all([
      fetch(`/api/finance/analytics?dateDebut=${dateDebut}&dateFin=${dateFin}`),
      fetch(`/api/finance/conversion?dateDebut=${dateDebut}&dateFin=${dateFin}`),
      fetch(`/api/finance/prevision`),
    ]);
    
    // ...
  };

  const handleExport = async (format: "excel" | "csv") => {
    const res = await fetch("/api/finance/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, dateDebut, dateFin }),
    });
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${format}-${Date.now()}.${format === "excel" ? "xlsx" : "csv"}`;
    a.click();
  };

  return (
    <div>
      {/* Filtres */}
      <div className="flex gap-3 mb-6">
        <input type="date" value={dateDebut} onChange={...} />
        <input type="date" value={dateFin} onChange={...} />
        <button onClick={fetchData}>Appliquer</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-6 mb-8">
        {/* ... */}
      </div>

      {/* Graphiques Recharts */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={evolution}>
          <Line dataKey="caHT" stroke="#EA4C89" />
        </LineChart>
      </ResponsiveContainer>

      {/* Export */}
      <div className="flex gap-3">
        <button onClick={() => handleExport("excel")}>
          📤 Export Excel
        </button>
        <button onClick={() => handleExport("csv")}>
          📄 Export CSV
        </button>
      </div>
    </div>
  );
}
```

---

## ✅ RÉCAPITULATIF COMPLET

### **APIs Créées**
- ✅ `GET /api/finance/analytics`
- ✅ `GET /api/finance/evolution`
- ✅ `GET /api/finance/repartition`
- ✅ `GET /api/finance/conversion` ⭐ NOUVEAU
- ✅ `GET /api/finance/prevision` ⭐ NOUVEAU
- ✅ `POST /api/finance/export` ⭐ NOUVEAU

### **Fonctionnalités**
- ✅ KPIs complets (CA, commissions, marges)
- ✅ Graphiques Recharts interactifs ⭐
- ✅ Filtres dates personnalisées ⭐
- ✅ Taux de conversion Négo → Collab ⭐
- ✅ Prévisions CA ⭐
- ✅ Export Excel/CSV professionnel ⭐
- ✅ Alertes automatiques ⭐
- ✅ Répartitions (talents, marques, sources)
- ✅ Comparaisons périodes
- ✅ Permissions ADMIN

### **Packages**
- ✅ recharts
- ✅ exceljs
- ✅ date-fns

---

## 🎉 **LE DASHBOARD EST ULTRA-COMPLET !**

**Un vrai outil de Business Intelligence niveau expert-comptable !** 💰📊🚀
