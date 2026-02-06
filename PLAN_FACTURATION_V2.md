# 📄 Plan : Système de Facturation V2 (Style Devis)

## 🎯 Objectif

Créer un système de facturation avec :
- ✅ Le même template visuel que les devis
- ✅ Possibilité d'ajouter des prestations avant de générer
- ✅ Possibilité d'ajouter des notes
- ✅ Interface d'édition avant génération du PDF

---

## 📋 Structure actuelle des Devis

### **DevisTemplate.tsx** :
```typescript
interface LigneDevis {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
  totalHT: number;
}

interface DevisData {
  reference: string;
  titre: string; // Titre de la campagne
  dateDocument: string;
  dateEcheance: string;
  emetteur: { ... }; // Glow Up Agency
  client: { ... };    // Marque
  lignes: LigneDevis[]; // Prestations détaillées
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  notes?: string; // Notes additionnelles
}
```

### **Workflow actuel Devis** :
```
1. Créer négociation → Ajouter livrables
2. Valider négociation
3. Générer devis avec :
   - Titre campagne
   - Liste des livrables (prestations)
   - Montants calculés
   - CGV sur pages 2-3
```

---

## 🆕 Nouveau système Factures

### **1. Nouveau Template : FactureTemplate.tsx**

Basé sur `DevisTemplate.tsx` avec adaptations :

```typescript
interface LigneFacture {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
  totalHT: number;
}

interface FactureData {
  reference: string;       // FAC-2026-0001
  titre: string;           // "Campagne Instagram Stories x3"
  dateDocument: string;     // Date d'émission
  dateEcheance: string;     // Date limite de paiement
  
  emetteur: {              // Glow Up Agency
    nom: string;
    adresse: string;
    codePostal: string;
    ville: string;
    pays: string;
    capital: number;
    siret: string;
    telephone: string;
    email: string;
    tva: string;
    siren: string;
    rcs: string;
    ape: string;
  };
  
  client: {                // Talent (pas la marque!)
    nom: string;
    prenom: string;
    adresse?: string;
    codePostal?: string;
    ville?: string;
    pays?: string;
    siret?: string;
    numeroTVA?: string;
  };
  
  lignes: LigneFacture[];  // Prestations détaillées
  
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  
  notes?: string;          // Notes additionnelles
  
  // Infos paiement
  iban?: string;
  bic?: string;
}
```

### **Différences Devis vs Facture** :

| Élément | Devis | Facture |
|---------|-------|---------|
| **Client** | Marque | **Talent** |
| **Type doc** | "DEVIS" | "FACTURE" |
| **Référence** | DEV-2026-XXX | FAC-2026-XXX |
| **CGV** | Pages 2-3 | **Pas de CGV** |
| **IBAN** | Non | **Oui** (pour paiement) |
| **Mentions** | Devis valable 30j | Paiement sous 30j |

---

## 🔄 Nouveau Workflow Facturation

### **Étape 1 : Collaboration publiée**
```
Collaboration PUBLIE
   ↓
Bouton "Facturer" visible (Admin/TM)
```

### **Étape 2 : Interface d'édition facture**
```
Clic sur "Facturer"
   ↓
Modal/Page d'édition :
   ┌─────────────────────────────────────┐
   │ 📄 Générer la facture               │
   ├─────────────────────────────────────┤
   │ Titre campagne: [Input]             │
   │                                      │
   │ Prestations:                         │
   │ ┌─────────────────────────────────┐ │
   │ │ Description      Qté  PU    HT  │ │
   │ │ [Input]          [1]  [500] 500 │ │
   │ │ + Ajouter ligne                  │ │
   │ └─────────────────────────────────┘ │
   │                                      │
   │ Notes additionnelles:                │
   │ [Textarea]                           │
   │                                      │
   │ Date d'échéance: [Date picker]      │
   │                                      │
   │ Récapitulatif:                       │
   │ Total HT:  500,00 €                 │
   │ TVA 20%:   100,00 €                 │
   │ Total TTC: 600,00 €                 │
   │                                      │
   │ [Annuler]     [Générer PDF] 🚀      │
   └─────────────────────────────────────┘
```

### **Étape 3 : Génération PDF**
```
Génération FactureTemplate.tsx
   ↓
Enregistrement dans /documents/factures/
   ↓
Création dans table Document (type: FACTURE)
   ↓
✅ Facture disponible pour envoi
```

---

## 📁 Fichiers à créer/modifier

### **Nouveaux fichiers** :

1. **`src/lib/documents/templates/FactureTemplate.tsx`**
   - Copie de DevisTemplate.tsx
   - Adaptations : Client = Talent, pas de CGV, ajout IBAN

2. **`src/app/(dashboard)/collaborations/[id]/facturer/page.tsx`**
   - Interface d'édition avant génération
   - Formulaire pour prestations + notes

3. **`src/app/api/collaborations/[id]/generer-facture/route.ts`**
   - POST pour générer la facture
   - Validation des données
   - Appel à FactureTemplate
   - Enregistrement PDF

### **Fichiers à modifier** :

1. **`src/app/(dashboard)/collaborations/[id]/page.tsx`**
   - Ajouter bouton "Facturer" si statut = PUBLIE

2. **`src/lib/documents/generatePDF.ts`**
   - Ajouter fonction `generateFacturePDF()`

---

## 🎨 Design de l'interface d'édition

### **Composants** :

```tsx
// Composant LignePrestationInput
interface LignePrestation {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
}

<div className="border rounded-xl p-4">
  <h3>Prestations</h3>
  
  {lignes.map((ligne, index) => (
    <div key={index} className="grid grid-cols-4 gap-3">
      <input 
        placeholder="Description"
        value={ligne.description}
      />
      <input 
        type="number"
        placeholder="Qté"
        value={ligne.quantite}
      />
      <input 
        type="number"
        placeholder="PU HT"
        value={ligne.prixUnitaire}
      />
      <div className="flex items-center gap-2">
        <span>{(ligne.quantite * ligne.prixUnitaire).toFixed(2)} €</span>
        <button onClick={() => removeLigne(index)}>
          🗑️
        </button>
      </div>
    </div>
  ))}
  
  <button onClick={addLigne}>
    + Ajouter une prestation
  </button>
</div>
```

---

## 💡 Exemple de facture générée

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  [LOGO]                        FACTURE              │
│  GLOW UP AGENCY                FAC-2026-0042        │
│  22 Avenue Victor Hugo         Date: 15/01/2026     │
│  13100 Aix-en-Provence         Échéance: 14/02/2026 │
│  France                                              │
│                                                      │
│  CLIENT:                                             │
│  Sophie Martin                                       │
│  45 rue de la République                             │
│  75001 Paris, France                                 │
│  SIRET: 123 456 789 00012                           │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Campagne: "Collection Printemps 2026"              │
│                                                      │
│  PRESTATIONS:                                        │
│  ┌──────────────────────────────────────────────┐  │
│  │ Description          Qté   PU HT    Total HT │  │
│  ├──────────────────────────────────────────────┤  │
│  │ Post Instagram        1   500,00 €   500,00 €│  │
│  │ Story Instagram       3   150,00 €   450,00 €│  │
│  │ Shooting photo        1   200,00 €   200,00 €│  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  NOTES:                                              │
│  Paiement sous 30 jours par virement bancaire       │
│                                                      │
│  ┌────────────────────────────────────┐            │
│  │ Total HT:           1 150,00 €     │            │
│  │ TVA 20%:              230,00 €     │            │
│  │ TOTAL TTC:          1 380,00 €     │            │
│  └────────────────────────────────────┘            │
│                                                      │
│  COORDONNÉES BANCAIRES:                              │
│  IBAN: FR76 1234 5678 9012 3456 7890 123           │
│  BIC: BNPAFRPP                                       │
│                                                      │
│  Paiement à effectuer sous 30 jours                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## ✅ Checklist d'implémentation

### Phase 1 : Template
- [ ] Créer `FactureTemplate.tsx`
- [ ] Adapter le design (pas de CGV)
- [ ] Ajouter IBAN/BIC
- [ ] Client = Talent (pas Marque)
- [ ] Tester génération PDF

### Phase 2 : Interface d'édition
- [ ] Créer page `/collaborations/[id]/facturer`
- [ ] Formulaire titre campagne
- [ ] Composant ajout/suppression prestations
- [ ] Champ notes
- [ ] Date d'échéance
- [ ] Récapitulatif montants
- [ ] Preview avant génération

### Phase 3 : API
- [ ] Route `POST /api/collaborations/[id]/generer-facture`
- [ ] Validation des données
- [ ] Génération PDF via FactureTemplate
- [ ] Enregistrement document
- [ ] Update collaboration → statut FACTURE_RECUE

### Phase 4 : Intégration
- [ ] Bouton "Facturer" sur page collab
- [ ] Redirect après génération
- [ ] Téléchargement/envoi PDF
- [ ] Historique des factures

---

## 🚀 Prêt à démarrer ?

Dis-moi si tu veux que je commence par :
1. **Le template FactureTemplate.tsx** ?
2. **L'interface d'édition** ?
3. **L'API de génération** ?

Ou je fais tout d'un coup ! 💪
