# 📋 WORKFLOW DES NÉGOCIATIONS - SYSTÈME FLEXIBLE

## 🎯 Principe Clé : Flexibilité sans Blocage

Le workflow des négociations est conçu pour **NE JAMAIS BLOQUER** le TM. Si une erreur est commise après soumission, le TM peut **TOUJOURS modifier** la négociation. Le système notifie automatiquement les HEAD_OF des modifications.

---

## 🔄 Workflow Complet

### 1️⃣ BROUILLON (Nouveau statut utilisé)

**Qui :** TM (Talent Manager)

**Actions possibles :**
- ✅ Modifier librement tous les champs
- ✅ Ajouter/supprimer des livrables
- ✅ Enregistrer sans soumettre
- ✅ Soumettre quand prêt

**UI :**
- Badge gris "Brouillon"
- Bouton bleu "Soumettre pour validation"
- Aucune notification envoyée

**Création :**
```typescript
// Depuis /negociations/new
- Bouton "Enregistrer en brouillon" → Sauvegarde en BROUILLON
- Bouton "Soumettre pour validation" → Sauvegarde + Soumet automatiquement
```

---

### 2️⃣ EN_ATTENTE (Soumis pour validation)

**Qui :** Automatique après soumission par le TM

**Actions possibles :**
- ✅ **TM peut ENCORE modifier** (c'est le principe clé !)
- ✅ HEAD_OF peut commenter
- ✅ HEAD_OF peut valider ou refuser

**Notifications :**
- 📧 Tous les HEAD_OF et ADMIN reçoivent une notification à la soumission
- ⚠️ Si le TM modifie, tous les HEAD_OF reçoivent une notification de modification

**UI :**
- Badge jaune "En attente"
- Bouton "Modifier" toujours actif pour le TM
- Si modifié : Badge orange "Modifications récentes" pour le HEAD_OF

**Comportement des modifications :**
```typescript
// Si TM modifie après soumission :
1. modifiedSinceReview = true
2. lastModifiedAt = now()
3. Notification envoyée aux HEAD_OF : "TM a modifié la négo"
4. Commentaire auto ajouté : "📝 Négociation mise à jour"
```

---

### 3️⃣ EN_DISCUSSION (HEAD_OF a commenté)

**Qui :** Automatique si HEAD_OF commente sur une négo EN_ATTENTE

**Actions possibles :**
- ✅ **TM peut TOUJOURS modifier** (jamais bloqué !)
- ✅ Tous peuvent commenter
- ✅ HEAD_OF peut valider ou refuser

**Notifications :**
- 📧 Même comportement qu'EN_ATTENTE
- ⚠️ Chaque modification par le TM notifie le HEAD_OF

**UI :**
- Badge bleu "En discussion"
- Section commentaires active
- Notifications de modifications

---

### 4️⃣ VALIDEE (Approuvée par HEAD_OF)

**Qui :** HEAD_OF ou ADMIN

**Actions :**
- ✅ Création automatique de la Collaboration
- ✅ Calcul des commissions selon la source (Inbound/Outbound)
- ✅ Copie de tous les livrables
- 🔒 Négociation verrouillée (plus modifiable)

**UI :**
- Badge vert "Validée"
- Bannière avec lien vers la collaboration créée
- Plus de boutons d'édition

---

### 5️⃣ REFUSEE (Rejetée par HEAD_OF)

**Qui :** HEAD_OF ou ADMIN

**Actions :**
- ✅ Raison du refus enregistrée
- 🔒 Négociation verrouillée

**UI :**
- Badge rouge "Refusée"
- Affichage de la raison du refus
- Plus de boutons d'édition

---

## 🔔 Système de Notifications

### Notifications envoyées automatiquement

| Événement | Destinataire | Titre | Déclencheur |
|-----------|--------------|-------|-------------|
| Nouvelle soumission | Tous HEAD_OF/ADMIN | "Nouvelle négociation à valider" | TM soumet (BROUILLON → EN_ATTENTE) |
| Modification après soumission | Tous HEAD_OF/ADMIN | "Négociation modifiée" | TM modifie quand EN_ATTENTE ou EN_DISCUSSION |
| Nouveau commentaire | TM + HEAD_OF | Selon contexte | Ajout de commentaire |

---

## 🎨 UI - Badge de Modifications

### Pour le HEAD_OF
Quand une négociation a été modifiée depuis sa dernière consultation :

```tsx
<div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-4">
  <AlertCircle className="w-5 h-5 text-amber-600" />
  <p className="font-medium text-amber-800">Modifications récentes</p>
  <p className="text-sm text-amber-700">
    Cette négociation a été modifiée depuis votre dernière consultation
    (le 26/01/2026 à 14:35)
  </p>
</div>
```

### Marquage automatique comme "Vu"
Quand un HEAD_OF consulte une négociation modifiée :
- `modifiedSinceReview` passe automatiquement à `false`
- `reviewedAt` est mis à jour
- Le badge disparaît pour ce HEAD_OF

---

## 🔧 Endpoints API

### POST `/api/negociations` - Créer
```json
{
  "talentId": "xxx",
  "marqueId": "yyy",
  "livrables": [...],
  // ...
}
```
→ Crée en statut `BROUILLON`

### POST `/api/negociations/[id]/soumettre` - Soumettre
- Passe de `BROUILLON` → `EN_ATTENTE`
- Envoie notifications aux HEAD_OF
- Valide que la négo est complète (au moins 1 livrable)

### PUT `/api/negociations/[id]` - Modifier
- ✅ Toujours autorisé pour le TM propriétaire
- ✅ Si EN_ATTENTE ou EN_DISCUSSION : flag `modifiedSinceReview = true`
- ✅ Notifications envoyées automatiquement
- ✅ Commentaire auto ajouté : "📝 Négociation mise à jour"
- ✅ Transaction Prisma pour éviter pertes de données

### POST `/api/negociations/[id]/marquer-vu` - Marquer comme vu
- Réservé aux HEAD_OF/ADMIN
- Réinitialise le flag `modifiedSinceReview`
- Appelé automatiquement quand le HEAD_OF consulte la page

### POST `/api/negociations/[id]/valider` - Valider/Refuser
```json
{
  "action": "valider" | "refuser",
  "raisonRefus": "..." // optionnel si refuser
}
```

### POST `/api/negociations/[id]/commentaires` - Commenter
- Ajoute un commentaire
- Si EN_ATTENTE + HEAD_OF commente → passe EN_DISCUSSION

---

## 📊 Champs Prisma Ajoutés

```prisma
model Negociation {
  // ... champs existants
  
  // Tracking des modifications
  modifiedSinceReview  Boolean   @default(false)
  lastModifiedAt       DateTime  @default(now())
  reviewedAt           DateTime?
  dateSubmitted        DateTime?
}
```

### Signification des champs

- **`modifiedSinceReview`** : `true` si la négo a été modifiée après soumission et que le HEAD_OF ne l'a pas encore vue
- **`lastModifiedAt`** : Date de la dernière modification
- **`reviewedAt`** : Date de la dernière consultation par un HEAD_OF
- **`dateSubmitted`** : Date de soumission initiale (passage de BROUILLON à EN_ATTENTE)

---

## ✅ Avantages de Cette Approche

| Avantage | Description |
|----------|-------------|
| 🔓 **Jamais bloqué** | Le TM peut toujours corriger ses erreurs |
| 🔔 **Transparence** | Le HEAD_OF sait toujours quand il y a eu des modifications |
| 📝 **Traçabilité** | Commentaires auto + historique des modifs |
| 🔒 **Intégrité** | Transactions Prisma pour éviter les pertes de données |
| 🎯 **Efficacité** | Moins de friction, workflow fluide |

---

## 🚀 Workflow Visuel

```
┌─────────────┐
│  BROUILLON  │ ◄── TM crée
└──────┬──────┘
       │ TM soumet
       │ (bouton "Soumettre")
       ▼
┌─────────────┐
│ EN_ATTENTE  │ ◄── Notifications HEAD_OF
└──────┬──────┘
       │ TM peut ENCORE modifier ✅
       │ (+ notifications automatiques)
       │
       ├──► HEAD_OF commente
       │         │
       │         ▼
       │  ┌──────────────┐
       │  │EN_DISCUSSION │
       │  └──────┬───────┘
       │         │
       ├─────────┴─────► HEAD_OF valide
       │                      │
       │                      ▼
       │                ┌──────────┐
       │                │ VALIDEE  │ → Crée Collaboration
       │                └──────────┘
       │
       └─────► HEAD_OF refuse
                      │
                      ▼
                ┌──────────┐
                │ REFUSEE  │
                └──────────┘
```

---

## 🧪 Tests à Effectuer

### Test 1 : Création et Soumission
1. ✅ Créer une négociation
2. ✅ Vérifier qu'elle est en BROUILLON
3. ✅ Cliquer "Soumettre"
4. ✅ Vérifier passage à EN_ATTENTE
5. ✅ Vérifier notification HEAD_OF

### Test 2 : Modification Après Soumission
1. ✅ Soumettre une négo
2. ✅ Modifier un livrable
3. ✅ Vérifier badge "Modifications récentes" pour HEAD_OF
4. ✅ Vérifier notification HEAD_OF
5. ✅ Vérifier commentaire auto ajouté

### Test 3 : Marquage Comme Vu
1. ✅ HEAD_OF consulte une négo modifiée
2. ✅ Vérifier disparition du badge
3. ✅ Vérifier `reviewedAt` mis à jour

### Test 4 : Validation
1. ✅ HEAD_OF valide une négo
2. ✅ Vérifier création collaboration
3. ✅ Vérifier calcul commissions
4. ✅ Vérifier copie livrables

---

## 📚 Ressources

- **Schéma Prisma** : `/prisma/schema.prisma`
- **API Routes** : `/src/app/api/negociations/**`
- **UI Détail** : `/src/app/(dashboard)/negociations/[id]/page.tsx`
- **UI Création** : `/src/app/(dashboard)/negociations/new/page.tsx`

---

## 🎓 Conclusion

Ce workflow flexible garantit que **le TM n'est jamais bloqué** tout en maintenant une **transparence totale** avec le HEAD_OF. Les notifications automatiques assurent que personne ne rate une mise à jour importante, et les transactions Prisma garantissent l'intégrité des données.

**Principe de base : Confiance + Transparence = Efficacité** 🚀
