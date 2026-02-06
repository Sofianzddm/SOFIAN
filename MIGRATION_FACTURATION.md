# 🚀 Guide de Migration - Nouveau Cycle de Facturation

## ⚡ Quick Start

### Étape 1 : Installation des dépendances (si nécessaire)

```bash
npm install
```

> Les dépendances nécessaires (`@react-pdf/renderer`) sont déjà dans le `package.json`

### Étape 2 : Vérifier la configuration

Le fichier `/src/lib/documents/config.ts` contient toutes les infos de votre agence :

```typescript
export const AGENCE_CONFIG = {
  raisonSociale: "SASU GLOW UP AGENCY",
  adresse: "1330 AVENUE JEAN-RENE GUILLIBERT...",
  siret: "92103414600024",
  tva: "FR26921034146",
  rib: {
    iban: "FR76 1695 8000 0151 0403 9277 377",
    bic: "QNTOFRP1XXX",
    // ...
  }
}
```

✅ **C'est déjà configuré avec vos vraies données !**

### Étape 3 : Tester la génération PDF

1. **Créer une facture de test** :

```bash
# Via l'interface ou avec curl
curl -X POST http://localhost:3000/api/documents/generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "FACTURE",
    "collaborationId": "ID_COLLAB_EXISTANTE",
    "lignes": [
      {
        "description": "Post Instagram",
        "quantite": 1,
        "prixUnitaire": 500
      }
    ]
  }'
```

2. **Télécharger le PDF** :

```
http://localhost:3000/api/documents/[ID_DOCUMENT]/pdf
```

✅ **Vous devriez voir un vrai PDF s'afficher !**

### Étape 4 : Tester le workflow complet

#### Scénario 1 : Facture simple

```typescript
// 1. Créer facture (statut: BROUILLON)
POST /api/documents/generate
{ type: "FACTURE", collaborationId: "xxx", lignes: [...] }

// 2. Valider et envoyer (statut: ENVOYE)
POST /api/documents/[id]/envoyer

// 3. Télécharger PDF
GET /api/documents/[id]/pdf

// 4. Marquer comme payée (statut: PAYE)
POST /api/documents/[id]/payer
{ datePaiement: "2026-01-26", referencePaiement: "VIR-123" }
```

#### Scénario 2 : Avoir partiel

```typescript
// 1. Créer avoir sur facture existante
POST /api/documents/avoir
{
  factureId: "xxx",
  motif: "Remboursement partiel - livrables modifiés",
  lignes: [
    { description: "Remboursement Post", quantite: 1, prixUnitaire: 200 }
  ]
}

// ✅ Résultat : Avoir créé, facture reste ENVOYE (pas ANNULE)
```

#### Scénario 3 : Avoir total

```typescript
// 1. Créer avoir pour le montant total
POST /api/documents/avoir
{
  factureId: "xxx",
  motif: "Annulation complète",
  lignes: [
    { description: "Remboursement total", quantite: 1, prixUnitaire: 500 }
  ]
}

// ✅ Résultat : Avoir créé, facture passe à ANNULE automatiquement
```

## 🔍 Vérifications Post-Migration

### 1. Vérifier les documents existants

```bash
# Lister tous les documents
curl http://localhost:3000/api/documents
```

**À vérifier** :
- Les anciens documents ont-ils un PDF généré ?
- Les montants sont-ils corrects ?
- Les statuts sont-ils cohérents ?

### 2. Vérifier les PDF existants

Si vous avez des documents avec `pdfBase64` en base :
- ✅ Ils seront retournés directement (cache)
- ✅ Les nouveaux seront générés à la volée
- 💡 Option : régénérer tous les PDF avec le nouveau template

### 3. Vérifier les numéros de documents

```sql
-- Vérifier les compteurs
SELECT * FROM compteurs ORDER BY type, annee;

-- Dernier numéro de facture 2026
SELECT * FROM compteurs WHERE type = 'FACTURE' AND annee = 2026;
```

**Résultat attendu** :
```
FACTURE | 2026 | 12  → Prochaine facture : F-2026-0013
```

## 🐛 Résolution de Problèmes

### Problème : "Une facture existe déjà pour cette collaboration"

**Cause** : Protection anti-doublons activée

**Solutions** :
1. Vérifier qu'une facture n'existe pas déjà : `GET /api/documents?collaborationId=xxx`
2. Si besoin d'une nouvelle facture, annuler l'ancienne : `POST /api/documents/[id]/annuler`
3. Créer la nouvelle facture

### Problème : PDF ne se génère pas

**Vérifications** :
1. `@react-pdf/renderer` est installé ? → `npm list @react-pdf/renderer`
2. Logs serveur ? → Regarder la console
3. Document existe en base ? → Vérifier l'ID

**Debug** :
```typescript
// Dans api/documents/[id]/pdf/route.ts
console.log("Document récupéré:", document);
console.log("PDF Data:", pdfData);
```

### Problème : Montants incorrects

**Vérifications** :
1. TVA correcte selon pays ? → Voir `getTypeTVA()` dans config.ts
2. Lignes bien calculées ? → Vérifier `lignesCalculees`
3. Arrondis ? → Prisma utilise Decimal avec 2 décimales

### Problème : Date d'échéance bizarre

**Vérifications** :
1. Délai de paiement configuré ? → Par défaut 30 jours
2. Calcul : date facture + délai → dernier jour du mois

**Exemple** :
```
Facture du 15/01/2026 + 30j fin de mois
= 14/02/2026 → dernier jour du mois → 28/02/2026 ✅
```

## 📊 Données de Test

### Créer une collaboration de test

```typescript
POST /api/collaborations
{
  talentId: "xxx",
  marqueId: "yyy",
  source: "INBOUND",
  montantBrut: 1000,
  commissionPercent: 20,
  statut: "GAGNE",
  livrables: [
    {
      typeContenu: "POST",
      quantite: 2,
      prixUnitaire: 500
    }
  ]
}
```

### Créer une marque de test

```typescript
POST /api/marques
{
  nom: "Test Brand SAS",
  secteur: "Cosmétique",
  raisonSociale: "TEST BRAND",
  siret: "12345678900012",
  numeroTVA: "FR12123456789",
  adresseRue: "10 rue de Test",
  codePostal: "75001",
  ville: "Paris",
  pays: "France"
}
```

## 🎓 Formation Utilisateurs

### Pour les TM (Talent Managers)

**Nouveau workflow** :
1. Collaboration gagnée → Créer facture (via UI)
2. Facture en BROUILLON → Vérifier montants
3. Demander validation à HEAD_OF/ADMIN
4. HEAD_OF envoie la facture → ENVOYE
5. Marque paie → ADMIN marque comme PAYE

**Changements** :
- ⚠️ Les factures ne sont plus directement ENVOYÉES
- ✅ Vous pouvez les préparer en BROUILLON
- ✅ Validation manuelle avant envoi

### Pour les ADMIN/HEAD_OF

**Nouvelles actions** :
1. **Envoyer** : `POST /api/documents/[id]/envoyer`
2. **Annuler** : `POST /api/documents/[id]/annuler` (avec motif)
3. **Marquer payé** : `POST /api/documents/[id]/payer`
4. **Créer avoir** : `POST /api/documents/avoir`

**Bonnes pratiques** :
- ✅ Toujours vérifier le PDF avant d'envoyer
- ✅ Indiquer un motif lors d'annulation
- ✅ Avoir partiel si modification, avoir total si annulation
- ✅ Vérifier la cohérence avec la collaboration

## 📈 Monitoring

### Requêtes utiles

```sql
-- Documents créés aujourd'hui
SELECT type, statut, COUNT(*)
FROM documents
WHERE DATE(createdAt) = CURRENT_DATE
GROUP BY type, statut;

-- Factures en retard
SELECT reference, "dateEcheance", "montantTTC"
FROM documents
WHERE type = 'FACTURE'
  AND statut = 'ENVOYE'
  AND "dateEcheance" < NOW();

-- CA du mois
SELECT SUM("montantTTC")
FROM documents
WHERE type = 'FACTURE'
  AND statut = 'PAYE'
  AND "datePaiement" >= DATE_TRUNC('month', CURRENT_DATE);
```

## ✅ Checklist de Migration

### Avant le déploiement
- [ ] Tests unitaires des endpoints
- [ ] Test génération PDF
- [ ] Test workflow complet (BROUILLON → ENVOYE → PAYE)
- [ ] Test avoirs (partiel et total)
- [ ] Vérification template PDF
- [ ] Vérification des montants TVA
- [ ] Documentation lue par l'équipe

### Après le déploiement
- [ ] Créer une facture de test en production
- [ ] Télécharger le PDF
- [ ] Vérifier les notifications
- [ ] Monitorer les logs pendant 24h
- [ ] Former les utilisateurs
- [ ] Créer des FAQ pour le support

## 📞 Support

En cas de problème :
1. **Consulter** : `FACTURATION.md` (doc complète)
2. **Vérifier** : Logs serveur et console navigateur
3. **Tester** : Endpoints avec curl/Postman
4. **Contacter** : Équipe technique

---

**Statut** : ✅ Prêt pour tests  
**Prochain déploiement** : Après validation tests  
**Version** : 2.0 (refonte complète)

🎉 **Bonne migration !**
