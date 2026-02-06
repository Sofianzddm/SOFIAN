# 🔍 Analyse du Flow de Négociation - Glow Up Platform

## 📊 Vue d'ensemble

Le système de négociations gère le workflow de prospection/proposition avant la conversion en collaboration.

---

## ✅ Ce Qui Va Bien

### 1. **Workflow Clair et Logique** 👍

```
BROUILLON → EN_ATTENTE → EN_DISCUSSION → VALIDÉE/REFUSÉE → COLLABORATION
```

- ✅ Statuts bien définis dans le schéma Prisma
- ✅ Séparation claire TM / HEAD_OF
- ✅ Conversion automatique en collaboration
- ✅ Référence auto-générée (`NEG-2026-0001`)

### 2. **Système de Commentaires** 💬

```typescript
// api/negociations/[id]/commentaires/route.ts
- ✅ Commentaires en temps réel
- ✅ Transition auto EN_ATTENTE → EN_DISCUSSION
- ✅ Interface chat bien pensée
```

### 3. **Calculs Automatiques** 🧮

```typescript
// api/negociations/[id]/valider/route.ts lignes 73-78
const montantBrut = nego.budgetFinal || nego.budgetSouhaite || nego.budgetMarque || 0;
const commissionPercent = nego.source === "INBOUND" 
  ? Number(nego.talent.commissionInbound) 
  : Number(nego.talent.commissionOutbound);
const commissionEuros = (Number(montantBrut) * commissionPercent) / 100;
const montantNet = Number(montantBrut) - commissionEuros;
```

✅ Commission calculée selon source (INBOUND 20% / OUTBOUND 30%)

### 4. **UI/UX Soignée** 🎨

- ✅ Interface moderne et intuitive
- ✅ Badges de statut colorés
- ✅ Timeline de commentaires
- ✅ Auto-fill des tarifs talent
- ✅ Calcul temps réel des budgets

---

## ❌ Ce Qui Ne Va Pas

### 1. **Statut BROUILLON Inutilisé** 🔴

**Problème** :
```typescript
// api/negociations/route.ts ligne 101
statut: "EN_ATTENTE", // Directement en attente de review
```

**Impact** :
- ❌ Le TM ne peut pas préparer une négo en brouillon
- ❌ Passe directement EN_ATTENTE → notification inutile au HEAD_OF
- ❌ Le statut BROUILLON existe dans l'enum mais n'est jamais utilisé

**Solution attendue** :
```typescript
// Créer en BROUILLON par défaut
statut: "BROUILLON",

// Ajouter endpoint pour soumettre
POST /api/negociations/[id]/soumettre
→ BROUILLON → EN_ATTENTE (+ notification HEAD_OF)
```

### 2. **Pas de Modification Après Soumission** 🔴

**Problème** :
```typescript
// negociations/[id]/page.tsx ligne 81
const canEdit = nego?.statut !== "VALIDEE" && nego?.statut !== "REFUSEE";
```

**Impact** :
- ❌ Une fois EN_ATTENTE, le TM peut ENCORE modifier
- ❌ Le HEAD_OF peut commenter pendant que le TM modifie en même temps
- ❌ Pas de verrouillage après soumission

**Scénario problématique** :
```
1. TM crée négo → EN_ATTENTE
2. HEAD_OF commente "OK pour 5000€"
3. TM modifie et passe à 6000€ pendant ce temps
4. HEAD_OF valide sans voir la modif
→ Incohérence !
```

**Solution** :
```typescript
const canEdit = ["BROUILLON", "REFUSEE"].includes(nego?.statut);

// Si modif nécessaire après soumission
POST /api/negociations/[id]/rappeler
→ EN_ATTENTE/EN_DISCUSSION → BROUILLON
```

### 3. **Manque de Notifications** 🟡

**Actuellement** :
- ❌ Aucune notification quand une négo est créée
- ❌ Aucune notification quand le HEAD_OF commente
- ❌ Aucune notification quand validée/refusée

**Attendu** :
```typescript
// Créer notifications
- TM crée → Notifier HEAD_OF
- HEAD_OF commente → Notifier TM
- HEAD_OF valide → Notifier TM + créer notif collab
- HEAD_OF refuse → Notifier TM
```

### 4. **Gestion du Budget Final Confuse** 🟡

**Problème** :
```typescript
// 3 budgets différents mais pas de workflow clair
budgetMarque     // Ce que la marque propose
budgetSouhaite   // Ce qu'on veut
budgetFinal      // ???? Quand est-il renseigné ?
```

**Scénario actuel** :
```typescript
// route.ts ligne 88
budgetFinal: data.budgetFinal ? parseFloat(data.budgetFinal) : null,
```

- ⚠️ Le TM peut renseigner `budgetFinal` directement → pas logique
- ❌ `budgetFinal` devrait être renseigné UNIQUEMENT lors de la validation

**Solution** :
```typescript
// Dans le formulaire de création/édition
- budgetMarque: ce que propose la marque
- budgetSouhaite: notre contreproposition

// Lors de la validation HEAD_OF
Modal: "Budget final négocié ?"
→ Renseigner budgetFinal
→ Valider

// Si pas renseigné, prendre budgetSouhaite par défaut
const budgetFinal = inputBudgetFinal || nego.budgetSouhaite;
```

### 5. **Pas de Suivi des Modifications** 🟡

**Problème** :
```typescript
// api/negociations/[id]/route.ts ligne 63-111
// UPDATE sans historique
await prisma.negociation.update({ ... });
```

**Impact** :
- ❌ Impossible de voir l'historique des modifications
- ❌ Si conflit, on ne sait pas qui a modifié quoi
- ❌ Pas d'audit trail

**Solution** :
```typescript
// Ajouter table NegoHistorique
model NegoHistorique {
  id            String   @id @default(cuid())
  negociationId String
  userId        String
  action        String   // "CREE", "MODIFIE", "SOUMISE", "VALIDEE", etc.
  modifications Json?    // Détail des changements
  createdAt     DateTime @default(now())
}
```

### 6. **Suppression Trop Permissive** 🟡

**Problème** :
```typescript
// api/negociations/[id]/route.ts ligne 114-142
// Seule vérification : pas déjà convertie
if (nego?.collaborationId) {
  return error;
}
```

**Impact** :
- ❌ Un TM peut supprimer une négo EN_DISCUSSION avec le HEAD_OF
- ❌ Perte d'informations et commentaires
- ❌ Pas de soft delete

**Solution** :
```typescript
// Vérifications supplémentaires
if (nego.statut === "VALIDEE") {
  return error("Impossible de supprimer une négo validée");
}

if (nego.commentaires.length > 0) {
  return error("Impossible de supprimer (a des commentaires). Utilisez 'Annuler'");
}

// Ou implémenter soft delete
statut: "ANNULEE"
```

### 7. **Livrables : Suppression en Cascade Brutale** 🔴

**Problème** :
```typescript
// api/negociations/[id]/route.ts ligne 72-75
// Supprimer les anciens livrables
await prisma.negoLivrable.deleteMany({
  where: { negociationId: id },
});
```

**Impact** :
- ❌ Si erreur lors du `update`, les livrables sont perdus !
- ❌ Pas de transaction
- ❌ Pas de rollback possible

**Solution** :
```typescript
// Utiliser une transaction
await prisma.$transaction(async (tx) => {
  await tx.negoLivrable.deleteMany({ where: { negociationId: id } });
  
  await tx.negociation.update({
    where: { id },
    data: {
      // ...
      livrables: {
        create: data.livrables.map(...)
      }
    }
  });
});
```

### 8. **Validation HEAD_OF Non Tracée** 🟡

**Problème** :
```typescript
// Lors de la validation, on sait QUI a validé
validePar: session.user.id,

// Mais on ne sait pas :
- ❌ À quelle date précise (dateValidation oui, mais pas l'heure)
- ❌ Quel était le contexte (commentaires au moment de la validation)
- ❌ Si des modifs ont été faites entre EN_ATTENTE et validation
```

**Solution** :
```typescript
// Snapshot au moment de la validation
model NegoValidation {
  id              String   @id
  negociationId   String   @unique
  validateurId    String
  dateValidation  DateTime @default(now())
  snapshotData    Json     // État complet de la négo au moment de la validation
  commentaire     String?  // Commentaire optionnel du validateur
}
```

---

## 🚀 Améliorations Recommandées

### **Priority 1 - Urgent** 🔴

#### 1. Implémenter le statut BROUILLON
```typescript
// Nouveau workflow
POST /api/negociations → statut: "BROUILLON"
POST /api/negociations/[id]/soumettre → EN_ATTENTE (+ notif)
```

#### 2. Bloquer les modifications après soumission
```typescript
// new/page.tsx & [id]/edit/page.tsx
const canEdit = ["BROUILLON", "REFUSEE"].includes(statut);
```

#### 3. Ajouter les transactions pour UPDATE
```typescript
// Protéger contre la perte de données
await prisma.$transaction([...]);
```

### **Priority 2 - Important** 🟡

#### 4. Système de notifications
```typescript
// Créer notifications automatiques
await createNotification({
  userId: head_of_id,
  type: "NOUVELLE_NEGOCIATION",
  titre: "Nouvelle négo à reviewer",
  lien: `/negociations/${id}`,
});
```

#### 5. Gérer budgetFinal proprement
```typescript
// Dans la modal de validation
<input name="budgetFinal" placeholder={budgetSouhaite} />
```

#### 6. Ajouter historique des modifications
```typescript
// Table NegoHistorique
model NegoHistorique {
  id String @id
  negociationId String
  action String
  modifications Json
  createdAt DateTime
}
```

### **Priority 3 - Nice to have** 🟢

#### 7. Soft delete au lieu de hard delete
```typescript
statut: "ANNULEE"
// Au lieu de prisma.delete()
```

#### 8. Rappel deadline
```typescript
// Cron job quotidien
if (dateDeadline - today <= 2) {
  notifyTM("Deadline dans 2 jours !");
}
```

#### 9. Templates de brief
```typescript
// Proposer des templates selon le secteur
const templates = {
  "Cosmétique": "Produit: ...\nCible: ...\n",
  "Mode": "Collection: ...\nStyle: ...\n"
};
```

#### 10. Export PDF de la négo
```typescript
// Pour partager avec la marque
GET /api/negociations/[id]/pdf
→ Génère un PDF récap de la proposition
```

---

## 🔄 Workflow Proposé (Amélioré)

### Nouveau Flow Complet

```
1️⃣ TM Crée
   statut: BROUILLON
   → Peut modifier librement
   → Pas de notification

2️⃣ TM Soumet
   POST /api/negociations/[id]/soumettre
   → BROUILLON → EN_ATTENTE
   → Notification HEAD_OF
   → Verrouillage modifications

3️⃣ HEAD_OF Review
   → Commente → EN_DISCUSSION
   → Notification TM

4️⃣ HEAD_OF Décide
   A. Valider :
      - Modal pour renseigner budgetFinal
      - Crée collaboration
      - VALIDEE
      - Notification TM
   
   B. Refuser :
      - Modal pour motif
      - REFUSEE
      - Notification TM
      - TM peut éditer à nouveau (retour BROUILLON)
   
   C. Demander modifs :
      - POST /api/negociations/[id]/rappeler
      - EN_DISCUSSION → BROUILLON
      - TM peut rééditer
```

### Actions Possibles par Statut

| Statut | TM Actions | HEAD_OF Actions |
|--------|------------|-----------------|
| BROUILLON | Éditer, Supprimer, Soumettre | - |
| EN_ATTENTE | Consulter, Commenter | Valider, Refuser, Commenter |
| EN_DISCUSSION | Consulter, Commenter | Valider, Refuser, Rappeler |
| VALIDEE | Consulter | Consulter |
| REFUSEE | Éditer (retour BROUILLON) | Consulter |
| ANNULEE | Consulter | Consulter |

---

## 📊 Métriques & KPIs à Ajouter

### Dashboard Négociations

```typescript
// Stats utiles à calculer
{
  negosEnAttente: 12,
  negosEnDiscussion: 5,
  tauxConversion: 68%, // VALIDEE / (VALIDEE + REFUSEE)
  delaiMoyenValidation: "2.5 jours",
  budgetMoyenNego: "3500€",
  topTM: [{ nom: "Alice", conversions: 15 }],
  alertesDeadline: 3, // Deadline < 3 jours
}
```

### Filtres Manquants

```typescript
// À ajouter dans l'UI
- Filtrer par TM
- Filtrer par marque
- Filtrer par secteur
- Filtrer par source (INBOUND/OUTBOUND)
- Filtrer par deadline (proche/dépassée)
- Filtrer par montant (< 1000€, 1000-5000€, > 5000€)
```

---

## 🐛 Bugs à Corriger

### 1. Race Condition sur l'UPDATE
```typescript
// Si 2 personnes modifient en même temps
→ Ajouter version optimiste
model Negociation {
  version Int @default(1)
}

// Lors de l'update
WHERE id = xxx AND version = currentVersion
UPDATE version = version + 1
```

### 2. Commentaires perdus si suppression
```typescript
// Cascade delete sur negoCommentaires
→ Empêcher suppression si commentaires
→ Ou implémenter soft delete
```

### 3. budgetFinal peut être null lors validation
```typescript
// ligne 73 valider/route.ts
const montantBrut = nego.budgetFinal || nego.budgetSouhaite || nego.budgetMarque || 0;

// Si tous null → montantBrut = 0
→ Ajouter validation : montantBrut doit être > 0
```

---

## 📁 Nouveaux Fichiers à Créer

### 1. Endpoint Soumettre
```
POST /api/negociations/[id]/soumettre
→ BROUILLON → EN_ATTENTE
→ Notifie HEAD_OF
```

### 2. Endpoint Rappeler
```
POST /api/negociations/[id]/rappeler
→ EN_ATTENTE/EN_DISCUSSION → BROUILLON
→ Notifie TM
```

### 3. Helpers Notifications
```
/src/lib/negociations/notifications.ts
- notifyNegoCreated()
- notifyNegoValidated()
- notifyNegoRefused()
- notifyNegoComment()
```

### 4. Helpers Validation
```
/src/lib/negociations/validation.ts
- validateNegoCanBeSubmitted()
- validateNegoCanBeValidated()
- validateBudgets()
```

### 5. Historique
```
/src/app/api/negociations/[id]/historique/route.ts
→ GET : retourne l'historique des modifications
```

---

## ✅ Checklist de Refonte

### Phase 1 : Critical
- [ ] Implémenter statut BROUILLON
- [ ] Créer endpoint `/soumettre`
- [ ] Bloquer modifications après soumission
- [ ] Ajouter transactions sur UPDATE
- [ ] Corriger gestion budgetFinal

### Phase 2 : Important
- [ ] Système de notifications complet
- [ ] Endpoint `/rappeler`
- [ ] Historique des modifications
- [ ] Validation montant > 0 lors conversion
- [ ] Soft delete (statut ANNULEE)

### Phase 3 : Nice to have
- [ ] Dashboard stats négociations
- [ ] Filtres avancés
- [ ] Templates de brief
- [ ] Export PDF proposition
- [ ] Rappels deadline automatiques
- [ ] Version optimiste (race conditions)

---

## 🎯 Résumé Exécutif

### ✅ FORCES
1. Workflow logique et clair
2. UI/UX soignée
3. Système de commentaires efficace
4. Calculs automatiques corrects
5. Conversion automatique en collab

### ❌ FAIBLESSES
1. **BROUILLON non utilisé** (critique)
2. **Modifications non bloquées après soumission** (critique)
3. **Pas de notifications** (important)
4. **budgetFinal mal géré** (important)
5. **Pas d'historique** (important)
6. **Suppression trop permissive** (moyen)
7. **UPDATE sans transaction** (critique)
8. **Pas d'audit trail** (moyen)

### 🎯 PRIORITÉS
1. 🔴 Workflow BROUILLON → EN_ATTENTE (bloquer modifs)
2. 🔴 Transactions sur UPDATE
3. 🟡 Système de notifications
4. 🟡 Gestion budgetFinal
5. 🟢 Historique et audit

---

**Statut** : Fonctionnel mais perfectible  
**Effort refonte** : ~3-5 jours  
**Impact** : Amélioration significative du workflow  

🎉 **Le système marche, mais ces corrections le rendraient vraiment robuste !**
