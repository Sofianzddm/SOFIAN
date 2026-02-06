# 📋 Documentation du Cycle de Facturation - Glow Up Platform

## 🎯 Vue d'ensemble

Le système de facturation gère l'ensemble du cycle commercial : devis, factures, avoirs et paiements, avec une liaison directe aux collaborations.

## 📊 Workflow Complet

### 1️⃣ Collaboration → Facture Marque

```
Collaboration (GAGNE ou EN_COURS ou PUBLIE)
  ↓
Génération Facture (statut: BROUILLON)
  ↓
Validation & Envoi (statut: ENVOYE)
  ↓
Paiement reçu (statut: PAYE, datePaiement renseignée)
  ↓
Collaboration reste dans son état actuel
```

### 2️⃣ Collaboration → Facture Talent

```
Collaboration (PUBLIE)
  ↓
Talent envoie sa facture (factureTalentUrl)
  ↓
Marquer facture reçue (statut: FACTURE_RECUE, factureTalentRecueAt)
  ↓
Payer le talent (statut: PAYE, paidAt)
```

## 🏗️ Architecture

### Modèles de données

**Document** (Factures Marque)
- `type`: DEVIS | FACTURE | AVOIR | BON_DE_COMMANDE
- `statut`: BROUILLON | ENVOYE | VALIDE | REFUSE | PAYE | ANNULE
- `collaborationId`: Lien vers la collaboration
- `montantHT`, `montantTVA`, `montantTTC`
- `dateDocument`, `dateEmission`, `dateEcheance`, `datePaiement`
- `lignes`: Détail des livrables
- `factureRef`: Pour les avoirs, référence à la facture
- `avoirRef`: Pour les factures, référence aux avoirs

**Collaboration** (Factures Talent)
- `montantBrut`: Montant total facturé à la marque
- `commissionEuros`: Commission Glow Up
- `montantNet`: Montant à payer au talent
- `factureTalentUrl`: Lien vers la facture du talent
- `factureTalentRecueAt`: Date de réception
- `paidAt`: Date de paiement au talent

## 🔄 Statuts des Documents

### BROUILLON
- Document créé mais non finalisé
- Peut être modifié ou supprimé
- Non visible par le client

### ENVOYE (ou "Facturé" dans l'UI)
- Document validé et envoyé au client
- En attente de paiement
- PDF généré automatiquement

### PAYE
- Paiement reçu et enregistré
- `datePaiement` renseignée
- Archive dans les documents payés

### ANNULE
- Document annulé (erreur, remplacement)
- Ne compte plus dans les statistiques
- Peut être remplacé par un avoir

## 📝 Types de Documents

### FACTURE
```typescript
// Génération
POST /api/documents/generate
{
  type: "FACTURE",
  collaborationId: "xxx",
  lignes: [
    { description: "Post Instagram", quantite: 1, prixUnitaire: 500 }
  ],
  titre?: "Kelly x Huggies - Janvier 2026",
  poClient?: "PO-12345",
  commentaires?: "Notes spéciales"
}

// Workflow
BROUILLON → ENVOYE → PAYE
```

### AVOIR
```typescript
// Génération
POST /api/documents/avoir
{
  factureId: "xxx",
  motif: "Annulation partielle",
  lignes: [
    { description: "Remboursement Post", quantite: 1, prixUnitaire: 500 }
  ]
}

// Comportement
- Montants négatifs automatiques
- Lié à la facture d'origine (factureRef)
- Si avoir total = facture → Facture passe à ANNULE
- Si avoir partiel → Facture reste ENVOYE
```

### DEVIS
```typescript
// Génération
POST /api/documents/generate
{
  type: "DEVIS",
  collaborationId: "xxx",
  lignes: [...],
  delaiPaiementJours: 30
}

// Utilisation
- Document préalable à la facturation
- Peut être converti en facture
- Statut: BROUILLON ou ENVOYE
```

## 🛠️ API Endpoints

### Génération de documents
```
POST /api/documents/generate
→ Crée un DEVIS, FACTURE ou BON_DE_COMMANDE
→ Statut initial: BROUILLON
→ Validation: vérifie qu'aucune facture n'existe pour cette collab
```

### Téléchargement PDF
```
GET /api/documents/[id]/pdf
→ Retourne le PDF généré à la volée avec @react-pdf/renderer
→ Utilise le template FactureTemplate.tsx
→ Cache possible en base64 (pdfBase64)
```

### Validation & Envoi
```
POST /api/documents/[id]/envoyer
→ BROUILLON → ENVOYE
→ Nécessite rôle ADMIN ou HEAD_OF
→ Notifie le TM
```

### Marquer comme payé
```
POST /api/documents/[id]/payer
{
  datePaiement: "2026-01-26",
  referencePaiement: "VIR-123"
}
→ ENVOYE → PAYE
→ Nécessite rôle ADMIN uniquement
→ Met à jour la collaboration si liée
```

### Créer un avoir
```
POST /api/documents/avoir
{
  factureId: "xxx",
  motif: "Raison de l'avoir",
  lignes: [...]
}
→ Crée un document AVOIR
→ Si montant total = facture → annule la facture
→ Si montant partiel → garde la facture active
```

### Annuler un document
```
POST /api/documents/[id]/annuler
{
  motif: "Raison de l'annulation"
}
→ Passe le statut à ANNULE
→ Interdit si déjà PAYE (créer un avoir)
→ Nécessite rôle ADMIN
```

## 🧮 Calculs Automatiques

### TVA
```typescript
// Détection automatique selon le pays du client
FRANCE → TVA 20%
EU avec n° TVA intracommunautaire → TVA 0% (autoliquidation)
EU sans n° TVA → TVA 20%
HORS EU → TVA 0% (export)
```

### Date d'échéance
```typescript
// Formule: date facture + délai jours → dernier jour du mois
// Exemple: facture du 15 janvier + 30j
// = 14 février → dernier jour du mois = 28/29 février
const dateEcheance = new Date(dateDoc);
dateEcheance.setDate(dateEcheance.getDate() + delaiPaiementJours);
dateEcheance.setMonth(dateEcheance.getMonth() + 1);
dateEcheance.setDate(0); // Dernier jour du mois
```

### Numérotation
```typescript
// Format: X-YYYY-NNNN
// F-2026-0001 (Facture)
// D-2026-0001 (Devis)
// A-2026-0001 (Avoir)
// BDC-2026-0001 (Bon de commande)

// Compteur auto-incrémenté par type et par année
```

## 📄 Template PDF

### Structure
```
Header
  - Logo Glow Up
  - Type de document + référence

Émetteur / Client
  - Infos légales complètes
  - SIRET, TVA, RCS

Infos document
  - Date émission / échéance
  - Mode de paiement
  - N° PO client

Lignes de facturation
  - Description / Quantité / Prix unit. HT / TVA / Total HT

Totaux
  - Total HT
  - TVA (%)
  - Total TTC

Mentions légales
  - Mention TVA si applicable
  - Pénalités de retard (factures uniquement)

RIB
  - Coordonnées bancaires QONTO

Footer
  - Contact / Adresse / Légal
```

### Données configurées
Toutes les données de l'agence proviennent de `src/lib/documents/config.ts` :
- `AGENCE_CONFIG`: Infos société, RIB, mentions légales
- `MENTIONS_TVA`: Configuration TVA par zone
- `PAYS_EU`: Liste des pays UE

## ✅ Validations Métier

### Génération de facture
```typescript
// Vérifications automatiques
1. ✅ Une seule facture active par collaboration
2. ✅ Montant cohérent avec la collaboration (tolérance 1%)
3. ✅ Lignes non vides
4. ✅ TVA correcte selon pays client
```

### Création d'avoir
```typescript
// Vérifications automatiques
1. ✅ Facture source existe et est FACTURE
2. ✅ Montant avoir ≤ montant facture
3. ✅ Total avoirs ≤ montant facture
4. ✅ Annulation auto si avoir total
```

### Paiement
```typescript
// Vérifications automatiques
1. ✅ Document est ENVOYE (pas BROUILLON)
2. ✅ Document non déjà PAYE
3. ✅ Document non ANNULE
4. ⚠️  Warning si avoirs existants
```

## 📊 Statistiques & Reporting

### API /api/factures
Retourne :
- **Stats du mois** : Entrées, Sorties, CA Net
- **Stats année** : Cumuls annuels
- **Évolution** : Comparaison mois N vs N-1
- **Alertes** : Factures en retard, en attente
- **Données mensuelles** : 6 derniers mois
- **Listes** : Factures marques, Factures talents

### Indicateurs clés
```typescript
CA Net = Entrées (factures marques payées) - Sorties (talents payés)
Taux encaissement = Factures payées / Factures envoyées
Délai moyen paiement = Moyenne (datePaiement - dateEmission)
```

## 🔒 Permissions

### Créer des documents
- ✅ ADMIN
- ✅ HEAD_OF
- ✅ HEAD_OF_INFLUENCE

### Envoyer/Valider
- ✅ ADMIN
- ✅ HEAD_OF
- ✅ HEAD_OF_INFLUENCE

### Marquer comme payé
- ✅ ADMIN uniquement

### Annuler
- ✅ ADMIN uniquement

### Consulter
- ✅ ADMIN
- ✅ HEAD_OF (tous)
- ✅ TM (leurs collaborations uniquement)

## 🚀 Améliorations Futures

### Phase 1 (Court terme)
- [ ] Système de relances automatiques (J+30, J+60)
- [ ] Export comptable (FEC, CSV)
- [ ] Signature électronique devis

### Phase 2 (Moyen terme)
- [ ] Acomptes et paiements partiels
- [ ] Facturation récurrente (abonnements)
- [ ] Intégration comptable (Pennylane, Sage)

### Phase 3 (Long terme)
- [ ] Prélèvement automatique SEPA
- [ ] Multi-devises
- [ ] Facturation multi-entités

## 📞 Support

En cas de problème :
1. Vérifier les logs serveur (`console.error`)
2. Vérifier le statut du document en BDD
3. Consulter les validations dans `src/lib/documents/validation.ts`
4. Contacter le support technique

---

**Version** : 1.0  
**Dernière mise à jour** : Janvier 2026  
**Maintenu par** : Équipe Glow Up Tech
