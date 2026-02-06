# 📄 Système de Facturation V2 - Style Devis

## ✅ Implémentation terminée !

Le nouveau système de facturation avec template professionnel (style devis) et personnalisation est maintenant opérationnel.

---

## 🎯 Nouveautés

### **Avant** (ancien système) :
- ❌ Facture générée automatiquement
- ❌ Pas de personnalisation
- ❌ Template basique
- ❌ Impossible d'ajouter des prestations

### **Après** (nouveau système) :
- ✅ **Interface d'édition** avant génération
- ✅ **Ajout/suppression de prestations** personnalisées
- ✅ **Notes additionnelles**
- ✅ **Template professionnel** identique aux devis
- ✅ **Titre de campagne** personnalisé
- ✅ **Coordonnées bancaires** (IBAN/BIC)
- ✅ **Calcul automatique** des totaux

---

## 📁 Fichiers créés

### 1. **Template PDF** (`src/lib/documents/templates/FactureTemplate.tsx`)
```typescript
interface FactureData {
  reference: string;        // FAC-2026-0001
  titre: string;            // "Campagne Instagram Stories"
  dateDocument: string;     // Date d'émission
  dateEcheance: string;     // Date limite paiement
  emetteur: { ... };        // Glow Up Agency + IBAN
  client: { ... };          // Talent (pas la marque!)
  lignes: LigneFacture[];   // Prestations détaillées
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  notes?: string;
}
```

**Design** :
- Logo Glow Up en haut
- Type "FACTURE" (au lieu de "DEVIS")
- Client = Talent (pas Marque)
- Tableau prestations avec colonnes : Désignation, Qté, PU HT, TVA, Total HT
- Récap TVA avec fond vert clair
- Totaux dans encadré noir/rose
- **Coordonnées bancaires** (IBAN/BIC) en vert
- Notes en italique
- Pénalités retard de paiement
- Footer avec infos légales

### 2. **Interface d'édition** (`src/app/(dashboard)/collaborations/[id]/facturer/page.tsx`)

**Composants** :
- ✅ Formulaire titre campagne
- ✅ Date d'échéance
- ✅ **Lignes de prestations** :
  - Description (text)
  - Quantité (number)
  - Prix unitaire HT (number)
  - Total calculé automatiquement
  - Boutons +/- pour ajouter/supprimer
- ✅ Notes additionnelles (textarea)
- ✅ **Récapitulatif en temps réel** :
  - Total HT
  - TVA 20%
  - Total TTC
- ✅ Bouton "Générer la facture"

**Auto-remplissage** :
- Titre = `Campagne {marque.nom}`
- Date échéance = +30 jours
- Lignes = livrables de la collaboration (si existants)

### 3. **API Génération** (`src/app/api/collaborations/[id]/generer-facture/route.ts`)

**Workflow** :
```typescript
POST /api/collaborations/[id]/generer-facture
  ↓
1. Validation des données
  ↓
2. Récupération collab + talent + marque
  ↓
3. Génération référence FAC-2026-XXXX
  ↓
4. Calcul montants HT/TVA/TTC
  ↓
5. Récupération paramètres agence (IBAN/BIC)
  ↓
6. Génération PDF avec FactureTemplate
  ↓
7. Sauvegarde dans /public/documents/factures/
  ↓
8. Création Document en BDD
  ↓
9. Update collaboration → FACTURE_RECUE
  ↓
✅ Retour URL du PDF
```

**Permissions** :
- ADMIN ✅
- HEAD_OF ✅
- TM ✅ (ses talents uniquement)

### 4. **Intégration** (modification `src/app/(dashboard)/collaborations/[id]/page.tsx`)

**Bouton ajouté** :
```tsx
{canGenerateFacture && (
  <Link href={`/collaborations/${collab.id}/facturer`}>
    📝 Facturer la collaboration
  </Link>
)}
```

**Condition** : Collaboration doit être en statut `PUBLIE` ou `FACTURE_RECUE`

---

## 🚀 Comment utiliser le nouveau système

### **Étape 1 : Collaboration publiée**
```
Dashboard → Collaborations → [Collaboration PUBLIE]
```

### **Étape 2 : Cliquer sur "Facturer"**
```
Sidebar Actions → "📝 Facturer la collaboration"
   ↓
Redirection vers /collaborations/[id]/facturer
```

### **Étape 3 : Interface d'édition**
```
┌─────────────────────────────────────────────┐
│ 📄 Générer la facture                       │
│                                              │
│ Informations générales                      │
│ ┌─────────────────────────────────────────┐ │
│ │ Titre: Campagne Instagram Stories       │ │
│ │ Échéance: [2026-02-25]                  │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Prestations                    [+ Ajouter]  │
│ ┌─────────────────────────────────────────┐ │
│ │ Description        Qté  PU HT    Total  │ │
│ │ [Post Instagram]   [1]  [500] → 500,00€ │ │
│ │ [Story x3]         [3]  [150] → 450,00€ │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Notes additionnelles                         │
│ ┌─────────────────────────────────────────┐ │
│ │ [Paiement par virement...]              │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│         ┌─────────────────────┐             │
│         │ Récapitulatif       │             │
│         │ Total HT: 950,00 € │             │
│         │ TVA 20%:  190,00 € │             │
│         │ Total TTC: 1140€   │             │
│         └─────────────────────┘             │
│                                              │
│    [Annuler]  [💾 Générer la facture]      │
└─────────────────────────────────────────────┘
```

### **Étape 4 : Génération**
```
Clic sur "Générer la facture"
   ↓
API POST /api/collaborations/[id]/generer-facture
   ↓
Génération PDF FactureTemplate.tsx
   ↓
Sauvegarde /public/documents/factures/FAC-2026-XXXX.pdf
   ↓
Création Document en BDD
   ↓
Update collaboration → FACTURE_RECUE
   ↓
✅ Redirection vers /collaborations/[id]
```

### **Étape 5 : Téléchargement**
```
Sidebar Actions → "📥 Facture FAC-2026-XXXX"
   ↓
Téléchargement PDF
```

---

## 📐 Structure du PDF Facture

```
┌────────────────────────────────────────────────────┐
│                                                    │
│  [LOGO GLOW UP]              FACTURE              │
│  GLOW UP AGENCY              N°FAC-2026-0042      │
│  22 Avenue Victor Hugo       Date: 15/01/2026     │
│  13100 Aix-en-Provence       Échéance: 14/02/2026 │
│  France                                            │
│  Capital: 1 000,00 €         Talent / Prestataire │
│  SIRET: 123456789           ┌──────────────────┐  │
│  Tel: +33 1 23 45 67 89     │ Sophie Martin    │  │
│  Email: contact@...         │ 45 rue ...       │  │
│                             │ 75001 Paris      │  │
│                             │ SIRET: ...       │  │
│                             └──────────────────┘  │
│                                                    │
├────────────────────────────────────────────────────┤
│                                                    │
│  Objet: Campagne "Collection Printemps 2026"     │
│  ───────────────────────────────────────────────  │
│                                                    │
│  DÉSIGNATION              QTÉ  PU HT     TOTAL HT │
│  ──────────────────────────────────────────────── │
│  Post Instagram            1   500,00 €  500,00 € │
│  Story Instagram           3   150,00 €  450,00 € │
│  Shooting photo            1   200,00 €  200,00 € │
│                                                    │
│  ┌────────────────────────────────────────────┐  │
│  │ BASE HT      TAUX        TVA               │  │
│  │ 1 150,00 €   20,00 %     230,00 €         │  │
│  └────────────────────────────────────────────┘  │
│                                                    │
│                     ┌─────────────────────┐       │
│                     │ TOTAL HT: 1 150,00 €│       │
│                     │ Total TVA:  230,00 €│       │
│                     │ TOTAL TTC: 1 380,00 €│       │
│                     │                     │       │
│                     │ NET À PAYER:       │       │
│                     │     1 380,00 €     │       │
│                     └─────────────────────┘       │
│                                                    │
│  ┌────────────────────────────────────────────┐  │
│  │ COORDONNÉES BANCAIRES                      │  │
│  │ IBAN: FR76 1234 5678 9012 3456 7890 123   │  │
│  │ BIC: BNPAFRPP                              │  │
│  │ Référence: FAC-2026-0042                   │  │
│  └────────────────────────────────────────────┘  │
│                                                    │
│  ⚠️ Paiement sous 30 jours                        │
│  En cas de retard: 3x taux légal + 40€           │
│                                                    │
│  Notes:                                           │
│  Paiement par virement bancaire uniquement       │
│                                                    │
└────────────────────────────────────────────────────┘

Footer: Infos légales Glow Up Agency
```

---

## 🔄 Workflow complet

```
1. TM crée une négociation → Ajoute livrables
   ↓
2. Négociation validée → Devient collaboration
   ↓
3. Collaboration EN_COURS → Talent publie
   ↓
4. Collaboration PUBLIE
   ↓
5. 📝 Bouton "Facturer la collaboration" apparaît
   ↓
6. Clic → Page d'édition /collaborations/[id]/facturer
   ↓
7. Édition :
   - Modifier titre
   - Ajouter/modifier prestations
   - Ajouter notes
   - Choisir date échéance
   ↓
8. "Générer la facture"
   ↓
9. PDF créé avec FactureTemplate
   ↓
10. Collaboration → statut FACTURE_RECUE
   ↓
11. ✅ Facture téléchargeable dans Actions
```

---

## 🎨 Exemple de facture personnalisée

**Scénario** : Collaboration avec 3 livrables différents

**Prestations** :
```
1. Post Instagram Feed           1 x 500,00 € = 500,00 €
2. Story Instagram (pack 3)      3 x 150,00 € = 450,00 €
3. Shooting produits (demi-j)    1 x 300,00 € = 300,00 €
                                  ─────────────────────────
                                  Total HT:    1 250,00 €
                                  TVA 20%:       250,00 €
                                  Total TTC:   1 500,00 €
```

**Notes** :
```
Paiement par virement bancaire uniquement.
Photos haute résolution fournies via WeTransfer.
Droits d'utilisation : 6 mois sur tous canaux digitaux.
```

---

## 🧪 Pour tester

### **Prérequis** :
1. Avoir une collaboration en statut **PUBLIE**
2. Être connecté en **ADMIN** ou **TM** (propriétaire du talent)

### **Test complet** :

```bash
# 1. Aller sur une collaboration publiée
/collaborations/[id]

# 2. Vérifier le bouton
Sidebar → Actions → "📝 Facturer la collaboration"

# 3. Cliquer → Page d'édition
/collaborations/[id]/facturer

# 4. Personnaliser
- Titre: "Campagne Noël 2026"
- Prestations:
  * Post Instagram | 1 | 500 | → 500€
  * Story x3       | 3 | 150 | → 450€
- Notes: "Paiement sous 15 jours"
- Échéance: 2026-02-15

# 5. Générer
Bouton "Générer la facture"

# 6. Vérifier
- ✅ PDF téléchargé
- ✅ Collaboration → FACTURE_RECUE
- ✅ Document créé en BDD
- ✅ Lien téléchargement dans Actions
```

---

## 📊 Comparaison Devis vs Facture

| Élément | Devis | Facture |
|---------|-------|---------|
| **Type** | DEVIS | FACTURE |
| **Référence** | DEV-2026-XXX | FAC-2026-XXX |
| **Émetteur** | Glow Up Agency | Glow Up Agency |
| **Client** | **Marque** | **Talent** |
| **Prestations** | Livrables marque | Prestations talent |
| **CGV** | Pages 2-3 (11 clauses) | **PAS de CGV** |
| **IBAN** | Non | **Oui** (pour paiement) |
| **Pages** | 3 pages | **1 page** |
| **Signature** | Oui (client) | Non |
| **Mention** | "Devis valable 30j" | "Paiement sous 30j" |

---

## 🎯 Avantages du nouveau système

### **Pour l'agence** :
- ✅ Factures professionnelles harmonisées
- ✅ Personnalisation selon chaque collaboration
- ✅ Détail clair des prestations
- ✅ IBAN inclus pour faciliter paiement
- ✅ Notes pour conditions spécifiques
- ✅ Traçabilité complète

### **Pour les talents** :
- ✅ Facture claire et professionnelle
- ✅ Détail des prestations réalisées
- ✅ Conditions de paiement visibles
- ✅ Informations bancaires incluses

### **Pour la comptabilité** :
- ✅ Numérotation automatique
- ✅ Archivage PDF organisé
- ✅ Lien avec collaboration
- ✅ Montants détaillés (HT/TVA/TTC)

---

## 🔍 Vérifications

### **Template** :
- ✅ FactureTemplate.tsx créé
- ✅ Design identique à DevisTemplate
- ✅ Client = Talent (pas Marque)
- ✅ IBAN/BIC inclus
- ✅ 1 page (pas de CGV)

### **Interface** :
- ✅ Page /collaborations/[id]/facturer
- ✅ Formulaire prestations dynamique
- ✅ Boutons +/- fonctionnels
- ✅ Calcul temps réel des totaux
- ✅ Validation avant génération

### **API** :
- ✅ Route POST créée
- ✅ Génération référence FAC-YYYY-XXXX
- ✅ Permissions vérifiées
- ✅ Sauvegarde PDF
- ✅ Création Document BDD
- ✅ Update collaboration

### **Intégration** :
- ✅ Bouton dans page collaboration
- ✅ Condition statut PUBLIE
- ✅ Lien vers page d'édition

---

## 📝 Notes techniques

### **Dépendances** :
- `@react-pdf/renderer` (déjà installé)
- `fs/promises` (Node.js natif)
- Template utilise le logo `public/logo-glowup.png`

### **Dossiers créés** :
- `/public/documents/factures/` (auto-créé si absent)

### **Base de données** :
- Table `Document` utilisée (type: FACTURE)
- Table `Compteur` (type: FAC)

---

## 🎉 Résultat final

**Vous avez maintenant** :
- ✅ Facturation professionnelle style devis
- ✅ Personnalisation complète avant génération
- ✅ Design harmonisé avec les devis
- ✅ Workflow fluide et intuitif

**Prochaines étapes possibles** :
- 📧 Envoi automatique par email
- 📊 Statistiques factures
- 💳 Intégration Qonto (suivi paiements)
- 🔔 Notifications échéances
- 📱 Preview PDF avant téléchargement

---

## ✨ Prêt à tester !

Ouvrez une collaboration en statut **PUBLIE** et cliquez sur **"Facturer la collaboration"** ! 🚀
