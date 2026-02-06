# 📁 DOSSIERS COMPLETS - Documentation

## 🎯 Vue d'ensemble

La page **Dossiers Complets** offre une vue hiérarchique organisée de **TOUTES** les collaborations avec leur historique complet, du début à la fin.

**Accès :** ⚠️ **ADMIN uniquement**

---

## 🏗️ Architecture de la page

### Hiérarchie à 3 niveaux

```
📁 TALENT (Niveau 1)
  └─ 📅 MOIS (Niveau 2)
      └─ 🏢 MARQUE + Historique Complet (Niveau 3)
          ├─ 1. 📋 Négociation
          ├─ 2. 📄 Devis
          ├─ 3. 🤝 Collaboration
          ├─ 4. 💰 Facture Client
          ├─ 5. 📤 Facture Talent
          └─ 6. ✅ Paiement Talent
```

---

## 📂 Fichiers créés

### 1. API Route
**`/src/app/api/dossiers/route.ts`**

Endpoint : `GET /api/dossiers`

**Fonctionnalités :**
- ✅ Vérification ADMIN uniquement
- ✅ Récupération de tous les talents
- ✅ Pour chaque talent : toutes ses collaborations avec relations complètes
- ✅ Organisation automatique par mois (année-mois)
- ✅ Tri chronologique décroissant

**Relations incluses :**
```typescript
- Talent
  - Collaborations
    - Marque (nom, secteur)
    - Livrables
    - Documents (devis, factures)
    - Négociation complète
    - Facture talent (URL + date)
    - Date de paiement
```

**Réponse JSON :**
```json
[
  {
    "talent": {
      "id": "xxx",
      "prenom": "Eline",
      "nom": "Collange",
      "photo": "..."
    },
    "mois": [
      {
        "moisKey": "2026-01",
        "moisLabel": "janvier 2026",
        "collaborations": [
          {
            "id": "...",
            "reference": "COLLAB-2026-0123",
            "marque": { "nom": "L'Oréal Paris" },
            "montantBrut": 2800,
            "montantNet": 2240,
            "negociation": { ... },
            "devis": { ... },
            "factureClient": { ... },
            "factureTalentUrl": "...",
            "paidAt": "2026-02-25"
          }
        ]
      }
    ]
  }
]
```

---

### 2. Page Frontend
**`/src/app/(dashboard)/dossiers/page.tsx`**

**Fonctionnalités :**
- ✅ Interface hiérarchique à 3 niveaux déployable
- ✅ Boutons "Tout déplier" / "Tout replier"
- ✅ Compteurs en temps réel (talents, collaborations)
- ✅ Vue chronologique complète de chaque collaboration
- ✅ Badges colorés selon les statuts
- ✅ Liens directs vers négociations/collaborations
- ✅ Téléchargement direct des documents PDF

**États gérés :**
```typescript
expandedTalents: Set<string>   // IDs des talents dépliés
expandedMois: Set<string>      // Clés "talentId-moisKey" dépliées
expandedCollabs: Set<string>   // IDs des collaborations dépliées
```

---

### 3. Sidebar
**`/src/components/layout/sidebar.tsx`**

Ajout de l'entrée "Dossiers" :
```typescript
{
  label: "Dossiers",
  href: "/dossiers",
  icon: FileText,
  roles: ["ADMIN"], // ⚠️ ADMIN uniquement
}
```

---

## 🎨 Interface Utilisateur

### Niveau 1 : Talent (simple)
```
┌─────────────────────────────────┐
│ [▼] 👤 Eline Collange           │
└─────────────────────────────────┘
```

### Niveau 2 : Mois (avec stats)
```
    ┌─────────────────────────────────────────┐
    │ [▼] 📅 Janvier 2026                     │
    │     2 collaborations • 5 400€           │
    └─────────────────────────────────────────┘
```

### Niveau 3 : Marque (historique complet)
```
        ┌─────────────────────────────────────┐
        │ [▼] 🏢 L'Oréal Paris                │
        │     2 800€ brut • 2 240€ net        │
        └─────────────────────────────────────┘
        
        │ 📋 1. Négociation NEG-2026-0045
        │    Budget final: 2800€ ✅
        │    [→ Voir]
        │
        │ 📄 2. Devis DV-2026-0112
        │    TTC: 3360€ • Accepté ✅
        │    [📥 Télécharger]
        │
        │ 🤝 3. Collaboration COLLAB-2026-0123
        │    Brut: 2800€ | Com: 560€ | Net: 2240€
        │    Publié le 25/01/2026 ✅
        │    [→ Voir]
        │
        │ 💰 4. Facture Client F-2026-0234
        │    TTC: 3360€
        │    Payée le 20/02/2026 ✅
        │    [📥 Télécharger]
        │
        │ 📤 5. Facture Talent
        │    2240€ • Reçue le 28/01/2026
        │    En attente de paiement ⏳
        │    [📥 Voir]
        │
        │ ✅ 6. Paiement Talent
        │    Payé le 25/02/2026
        │    Dossier clôturé ✅
```

---

## 🎯 Cas d'usage

### 1. **Vérification rapide d'un dossier talent**
L'admin peut déplier un talent et voir immédiatement tous ses dossiers par mois.

### 2. **Suivi des paiements**
Voir en un coup d'œil quelles collaborations ont :
- ✅ Facture client payée
- ⏳ Facture talent en attente
- ❌ Talent pas encore payé

### 3. **Audit comptable**
Vérifier que pour chaque collaboration :
- La négociation existe
- Le devis a été envoyé
- La facture client est émise et payée
- La facture talent est reçue
- Le talent a été payé

### 4. **Traçabilité complète**
Voir l'historique chronologique complet d'une collaboration sans naviguer entre plusieurs pages.

---

## 📊 Statistiques affichées

### En-tête
```
X talent(s) • Y collaboration(s)
```

### Par mois
```
X collaboration(s) • Y€ total
```

### Par collaboration
```
Brut: X€
Commission: Y€ (Z%)
Net talent: W€
```

---

## 🔒 Sécurité

### Vérifications API
```typescript
// Authentification requise
if (!session?.user) {
  return 401;
}

// ADMIN uniquement
if (session.user.role !== "ADMIN") {
  return 403;
}
```

### Protection côté client
- Le menu "Dossiers" n'apparaît que pour les ADMIN
- La page redirige automatiquement si pas ADMIN (alerte affichée)

---

## 🚀 Performance

### Optimisations
- ✅ Une seule requête API au chargement
- ✅ Pas de requêtes supplémentaires lors du déploiement des niveaux
- ✅ Toutes les données chargées en mémoire côté client
- ✅ Tri et organisation côté serveur

### Charge serveur
Pour 50 talents avec moyenne de 10 collaborations chacun :
- 500 collaborations à charger
- ~2000 documents associés
- Temps de réponse estimé : < 3 secondes

---

## 📈 Évolutions futures possibles

### 1. Filtres avancés
- Filtrer par période (mois/année)
- Filtrer par statut de paiement
- Filtrer par marque
- Recherche par référence

### 2. Export
- Export Excel de tous les dossiers
- Export PDF d'un dossier spécifique
- Export comptable (CSV)

### 3. Actions en masse
- Marquer plusieurs talents comme payés
- Générer des rappels de paiement
- Relancer les factures en retard

### 4. Statistiques avancées
- Graphiques d'évolution par talent
- Comparaison mensuelle
- Temps moyen de paiement

---

## ✅ Checklist de test

- [ ] Se connecter en tant qu'ADMIN
- [ ] Vérifier que "Dossiers" apparaît dans le menu
- [ ] Accéder à la page `/dossiers`
- [ ] Vérifier l'affichage des talents
- [ ] Déplier un talent → voir les mois
- [ ] Déplier un mois → voir les collaborations
- [ ] Déplier une collaboration → voir l'historique complet
- [ ] Cliquer sur "Tout déplier" → tout se déplie
- [ ] Cliquer sur "Tout replier" → tout se replie
- [ ] Cliquer sur un lien "Voir la négociation" → ouvre la page
- [ ] Cliquer sur "Télécharger PDF" → ouvre le document
- [ ] Se connecter en tant que HEAD_OF → menu "Dossiers" absent
- [ ] Tenter d'accéder à `/dossiers` en HEAD_OF → erreur 403

---

## 🎉 Résultat

**La page "Dossiers Complets" offre maintenant une vue unifiée et hiérarchique de TOUTES les collaborations avec leur historique complet, accessible uniquement aux ADMIN !** ✨

Fini de naviguer entre 5 pages différentes pour suivre une collaboration ! Tout est au même endroit, organisé chronologiquement par talent → mois → marque. 🚀
