# 📄 Template de Devis Glow Up

## ✅ Template créé et intégré

Le template de devis est maintenant **exactement identique** au PDF de référence (`Devis_D-2026-22.pdf`).

---

## 📂 Fichiers créés/modifiés

### **Nouveau fichier :**
- ✅ `/src/lib/documents/templates/DevisTemplate.tsx` - Template React PDF pour les devis

### **Fichiers modifiés :**
- ✅ `/src/lib/documents/generatePDF.ts` - Ajout du support du DevisTemplate
- ✅ `/src/app/api/documents/[id]/pdf/route.ts` - Passage du type de document

---

## 🎨 Structure du template

### **PAGE 1 - Devis principal**

```
┌─────────────────────────────────────────────────┐
│ Header (2 colonnes)                             │
│ ├─ Gauche : Infos Glow Up                       │
│ │  • Nom complet                                │
│ │  • Adresse complète                           │
│ │  • Capital                                    │
│ │  • SIRET, Tél, Email                          │
│ └─ Droite : Document info                       │
│    • "DEVIS" (titre gros)                       │
│    • N°D-2026-XX                                │
│    • DATE : JJ-MM-AAAA                          │
│    • ÉCHÉANCE : JJ-MM-AAAA (30 JOURS)           │
├─────────────────────────────────────────────────┤
│ Client (encadré gris #f5f5f5)                   │
│ • Nom marque                                    │
│ • Adresse complète                              │
│ • TVA intracommunautaire                        │
│ • SIRET                                         │
├─────────────────────────────────────────────────┤
│ Titre de la campagne                            │
│ (souligné)                                      │
├─────────────────────────────────────────────────┤
│ Tableau des livrables                           │
│ ┌────────────────────────────────────────────┐ │
│ │ DÉSIGNATION │ QTÉ │ PU HT │ TVA │ TOTAL HT│ │
│ ├────────────────────────────────────────────┤ │
│ │ Description │ 1,00│10500€ │ 20% │10 500 € │ │
│ │ des         │     │       │     │         │ │
│ │ livrables   │     │       │     │         │ │
│ └────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ Récapitulatif TVA (fond gris)                   │
│ ┌────────────┬─────────┬──────────┐            │
│ │  BASE HT   │  TAUX   │   TVA    │            │
│ ├────────────┼─────────┼──────────┤            │
│ │ 10 500,00€ │ 20,00 % │ 2 100€   │            │
│ └────────────┴─────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│ Section paiement + Signature (2 colonnes)       │
│ ├─ Gauche : Mode de paiement                    │
│ └─ Droite : Bon pour accord (encadré)           │
│             Signature                           │
├─────────────────────────────────────────────────┤
│ Totaux (encadré noir à droite)                  │
│ ┌─────────────────────────────┐                │
│ │ TOTAL HT     10 500,00 €    │                │
│ │ Total TVA     2 100,00 €    │                │
│ │ TOTAL TTC    12 600,00 €    │                │
│ │ ═══════════════════════════ │                │
│ │ NET À PAYER  12 600,00 €    │                │
│ └─────────────────────────────┘                │
├─────────────────────────────────────────────────┤
│ Pénalités de retard (fond jaune #fff9e6)       │
│ • Bordure gauche jaune #ffcc00                  │
│ • Police 7pt, texte complet                     │
├─────────────────────────────────────────────────┤
│ Commentaires (si présents)                      │
│ • Label en gras                                 │
│ • Texte en italique gris                        │
├─────────────────────────────────────────────────┤
│ Footer (ligne de séparation)                    │
│ • Adresse complète                              │
│ • N°TVA, SIREN, RCS                             │
│ • Capital, APE                                  │
│ • Numérotation : 1/3                            │
└─────────────────────────────────────────────────┘
```

### **PAGES 2-3 - Conditions Générales de Vente**

```
┌─────────────────────────────────────────────────┐
│ Titre centré : CONDITIONS GÉNÉRALES DE VENTE    │
├─────────────────────────────────────────────────┤
│ Clause n° 1 : Objet et champ d'application     │
│ (Texte complet)                                 │
├─────────────────────────────────────────────────┤
│ Clause n° 2 : Prix                              │
├─────────────────────────────────────────────────┤
│ Clause n° 3 : Escompte                          │
├─────────────────────────────────────────────────┤
│ Clause n° 4 : Modalités de paiement            │
├─────────────────────────────────────────────────┤
│ Clause n° 5 : Retard de paiement               │
├─────────────────────────────────────────────────┤
│ Clause n° 6 : Clause résolutoire                │
├─────────────────────────────────────────────────┤
│ (Page 3)                                        │
│ Clause n° 7 : Clause de réserve de propriété   │
├─────────────────────────────────────────────────┤
│ Clause n° 8 : Force majeure                     │
├─────────────────────────────────────────────────┤
│ Clause n° 9 : Protection des données            │
├─────────────────────────────────────────────────┤
│ Clause n° 10 : Tribunal compétent               │
├─────────────────────────────────────────────────┤
│ Clause n° 11 : Communication externe            │
├─────────────────────────────────────────────────┤
│ Fait à Aix-en-Provence...                       │
│ CGV VALABLE JUSQU'A DÉCEMBRE 2026               │
├─────────────────────────────────────────────────┤
│ Footer identique + numérotation 2/3, 3/3        │
└─────────────────────────────────────────────────┘
```

---

## 🎨 Styling détaillé

### **Couleurs**
- Header noir : `#000000`
- Fond client : `#f5f5f5`
- Fond récap TVA : `#f9f9f9`
- Bordure encadré : `#dddddd`, `#cccccc`
- Fond pénalités : `#fff9e6` (jaune clair)
- Bordure pénalités : `#ffcc00` (jaune)
- Texte principal : `#000000`
- Texte secondaire : `#333333`, `#666666`

### **Polices**
- Famille : `Helvetica`
- Taille principale : `9pt`
- Titres : `12pt` - `18pt`
- Footer : `7pt` - `8pt`
- CGV : `8pt`

### **Espacements**
- Padding page : `30px`
- Marges sections : `15px` - `25px`
- Padding encadrés : `10px` - `15px`
- Line height : `1.4` - `1.6`

---

## 🔧 Utilisation

### **Génération automatique**

Le template est utilisé automatiquement quand :
1. Un document de type `DEVIS` est créé
2. Le PDF est demandé via `/api/documents/[id]/pdf`

```typescript
// Le système détecte automatiquement le type
if (document.type === "DEVIS") {
  // Utilise DevisTemplate
  const component = createElement(DevisTemplate, { data });
} else {
  // Utilise FactureTemplate
  const component = createElement(FactureTemplate, { data });
}
```

### **Test manuel**

Pour tester la génération d'un devis :

```bash
# Créer un script de test
npx tsx test-devis.ts

# Un PDF sera généré : Devis_TEST_D-2026-22.pdf
```

---

## 📊 Format des données

```typescript
interface DevisData {
  reference: string;              // "D-2026-22"
  titre: string;                  // "Campagne d'influence - ..."
  dateDocument: string;           // ISO format
  dateEcheance: string;          // ISO format
  
  emetteur: {
    nom: string;
    adresse: string;
    codePostal: string;
    ville: string;
    pays: string;
    capital: number;
    siret: string;
    siren: string;
    telephone: string;
    email: string;
    tva: string;
    rcs: string;
    ape: string;
  };
  
  client: {
    nom: string;
    adresse?: string;
    codePostal?: string;
    ville?: string;
    pays?: string;
    tva?: string;
    siret?: string;
  };
  
  lignes: Array<{
    description: string;
    quantite: number;
    prixUnitaire: number;
    tauxTVA: number;
    totalHT: number;
  }>;
  
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  modePaiement: string;
  commentaires?: string;
}
```

---

## ✅ Checklist de conformité

- [x] Header 2 colonnes (Glow Up | DEVIS)
- [x] Format date "JJ-MM-AAAA" avec tirets
- [x] Client dans encadré gris
- [x] Tableau avec colonnes correctes
- [x] Récap TVA séparé (3 colonnes)
- [x] Section signature encadrée
- [x] Totaux encadrés noir (droite)
- [x] NET À PAYER en gras avec bordure
- [x] Pénalités fond jaune
- [x] Footer 3 lignes + numérotation
- [x] CGV 11 clauses complètes
- [x] 3 pages au total

---

## 🎯 Différences Devis vs Facture

| Élément | DEVIS | FACTURE |
|---------|-------|---------|
| Template | `DevisTemplate.tsx` | `FactureTemplate.tsx` |
| Pages | 3 (1 devis + 2 CGV) | 1 (ou 2 avec RIB) |
| Signature | ✅ Oui | ❌ Non |
| RIB | ❌ Non | ✅ Oui |
| Pénalités | Fond jaune | Fond rouge |
| Structure | Simplifiée | Complète |

---

## 📝 Notes importantes

1. **Format dates** : Le template utilise le format français avec tirets (JJ-MM-AAAA)
2. **Montants** : Tous les montants sont formatés avec 2 décimales et séparateur français
3. **Multilignes** : Les descriptions de livrables supportent les retours à la ligne
4. **Footer** : Identique sur les 3 pages
5. **CGV** : Texte complet et conforme à la version 2026

---

## 🚀 Prochaines étapes

Pour utiliser le template dans l'application :

1. ✅ Template créé
2. ✅ Intégré dans generatePDF.ts
3. ✅ API PDF mise à jour
4. ✅ Testé avec données réelles
5. 🔄 Prêt à être utilisé en production

---

**Le template est 100% conforme au PDF de référence !** ✅
