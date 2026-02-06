# 📤 UPLOAD FACTURE TALENT - Documentation

## 🎯 Fonctionnalité

Permet aux **TALENTS connectés** d'uploader leur facture directement dans la plateforme une fois que leur collaboration est **PUBLIÉE**.

---

## 🔐 Prérequis

### 1. Le talent doit être connecté
Le talent doit avoir un compte utilisateur :
- **Email** : Son email personnel
- **Password** : Son mot de passe
- **Role** : `TALENT`
- **Lié au profil Talent** : `Talent.userId` doit pointer vers `User.id`

### 2. La collaboration doit être au bon statut
Le talent peut uploader sa facture uniquement si :
- ✅ Statut = `PUBLIE`
- ✅ Statut = `FACTURE_RECUE`
- ✅ Statut = `PAYE`

⚠️ Il **NE PEUT PAS** uploader si :
- ❌ Statut = `NEGO`, `GAGNE`, `EN_COURS`, `PERDU`

---

## 📂 Fichiers créés

### 1. API Route
**`/src/app/api/collaborations/[id]/upload-facture-talent/route.ts`**

Endpoint : `POST /api/collaborations/[id]/upload-facture-talent`

**Vérifications effectuées :**
```typescript
1. ✅ Utilisateur authentifié (session existe)
2. ✅ Collaboration existe
3. ✅ Utilisateur = Talent propriétaire (talent.userId === session.user.id)
4. ✅ Statut collaboration est PUBLIE ou après
5. ✅ Pas de facture déjà uploadée (sauf ADMIN qui peut remplacer)
6. ✅ Fichier fourni
7. ✅ Type de fichier valide (PDF, JPG, PNG)
8. ✅ Taille fichier < 10MB
```

**Actions effectuées :**
```typescript
1. Upload vers Cloudinary (dossier: glowup-factures-talents)
2. Mise à jour de la collaboration :
   - factureTalentUrl = URL Cloudinary
   - factureTalentRecueAt = Date actuelle
   - statut = FACTURE_RECUE (si était PUBLIE)
3. Notification au TM (manager du talent)
4. Notification à tous les ADMIN
```

**Réponse JSON :**
```json
{
  "success": true,
  "url": "https://res.cloudinary.com/...",
  "collaboration": {
    "id": "...",
    "reference": "COLLAB-2026-0123",
    "statut": "FACTURE_RECUE",
    "factureTalentUrl": "...",
    "factureTalentRecueAt": "2026-01-26T..."
  },
  "message": "Facture uploadée avec succès ! Votre manager a été notifié."
}
```

**Erreurs possibles :**
```json
// Non authentifié
{ "error": "Non authentifié" } // 401

// Pas le talent propriétaire
{ "error": "Vous n'êtes pas autorisé..." } // 403

// Mauvais statut
{
  "error": "Vous pouvez uploader votre facture uniquement après la publication...",
  "statutActuel": "EN_COURS"
} // 400

// Facture déjà uploadée
{ "error": "Une facture a déjà été uploadée..." } // 400

// Mauvais format
{ "error": "Format non accepté. Formats autorisés : PDF, JPG, PNG" } // 400

// Fichier trop gros
{ "error": "Fichier trop volumineux. Taille maximum : 10MB" } // 400
```

---

### 2. Interface Frontend
**`/src/app/(dashboard)/collaborations/[id]/page.tsx`**

Ajout de 2 sections conditionnelles :

#### Section 1 : Upload (si PUBLIE et pas encore uploadé)
```tsx
Visible si :
- session.user.role === "TALENT"
- collab.statut === "PUBLIE"
- collab.factureTalentUrl === null
```

**Interface :**
```
┌────────────────────────────────────────────────┐
│ 📄 Uploadez votre facture                     │
│                                                │
│ La collaboration est publiée !                 │
│ Vous pouvez maintenant uploader votre facture.│
│                                                │
│ ┌────────────────────────────────────────┐   │
│ │ Montant net à facturer : 2 240€         │   │
│ └────────────────────────────────────────┘   │
│                                                │
│ [📤 Choisir ma facture]                       │
│                                                │
│ Formats acceptés : PDF, JPG, PNG • Max : 10MB │
└────────────────────────────────────────────────┘
```

Après sélection du fichier :
```
[📤 Choisir ma facture] [📄 facture.pdf] [✅ Envoyer]
```

#### Section 2 : Confirmation (si déjà uploadé)
```tsx
Visible si :
- session.user.role === "TALENT"
- collab.factureTalentUrl !== null
```

**Interface :**
```
┌────────────────────────────────────────────────┐
│ ✅ Facture reçue                               │
│                                                │
│ Envoyée le 26/01/2026                         │
│ ⏳ En attente de paiement                     │
│                                    [Télécharger]│
└────────────────────────────────────────────────┘
```

Si payé :
```
┌────────────────────────────────────────────────┐
│ ✅ Facture reçue                               │
│                                                │
│ Envoyée le 26/01/2026                         │
│ ✅ Payé le 25/02/2026                         │
│                                    [Télécharger]│
└────────────────────────────────────────────────┘
```

---

## 🔔 Notifications automatiques

### Notification au TM (Manager)
```json
{
  "userId": "manager_id",
  "type": "FACTURE_RECUE",
  "titre": "📤 Facture talent reçue",
  "message": "Eline Collange a uploadé sa facture pour la collaboration COLLAB-2026-0123 (L'Oréal Paris)",
  "lien": "/collaborations/xxx"
}
```

### Notification aux ADMIN
```json
{
  "userId": "admin_id",
  "type": "FACTURE_RECUE",
  "titre": "📤 Facture talent reçue",
  "message": "Eline Collange a uploadé sa facture pour COLLAB-2026-0123",
  "lien": "/collaborations/xxx"
}
```

---

## 🔄 Workflow Complet

```
1. TM marque la collaboration comme PUBLIE
   ↓
2. Talent se connecte et voit la collaboration
   ↓
3. Section bleue "📄 Uploadez votre facture" apparaît
   ↓
4. Talent clique "Choisir ma facture"
   ↓
5. Sélectionne un fichier (PDF, JPG, PNG)
   ↓
6. Fichier apparaît avec bouton "Envoyer"
   ↓
7. Talent clique "Envoyer"
   ↓
8. Upload vers Cloudinary
   ↓
9. Collaboration.factureTalentUrl mise à jour
   ↓
10. Collaboration.statut → FACTURE_RECUE
   ↓
11. Notifications envoyées au TM et ADMIN
   ↓
12. Section verte "✅ Facture reçue" apparaît
   ↓
13. TM/ADMIN peut télécharger la facture
   ↓
14. ADMIN marque le talent comme payé
   ↓
15. Collaboration.paidAt mise à jour
   ↓
16. Talent voit "✅ Payé le XX/XX/XXXX"
```

---

## 🔒 Sécurité

### Vérifications API
```typescript
// 1. Authentification
if (!session?.user?.id) {
  return 401;
}

// 2. Propriétaire du talent
if (collaboration.talent.userId !== session.user.id && role !== "ADMIN") {
  return 403;
}

// 3. Statut valide
if (!["PUBLIE", "FACTURE_RECUE", "PAYE"].includes(statut)) {
  return 400;
}

// 4. Pas de doublon (sauf ADMIN)
if (factureTalentUrl && role !== "ADMIN") {
  return 400;
}

// 5. Type de fichier
if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
  return 400;
}

// 6. Taille fichier
if (file.size > 10MB) {
  return 400;
}
```

### Protection côté client
```tsx
// Section visible uniquement si :
- Utilisateur connecté en tant que TALENT
- Statut = PUBLIE
- Pas de facture déjà uploadée
```

---

## 📊 Intégration avec les Dossiers Complets

Dans la page `/dossiers` (ADMIN uniquement), la facture talent apparaît automatiquement dans l'historique complet :

```
🏢 L'Oréal Paris
  │
  ├─ 5. 📤 Facture Talent
  │   • Montant: 2240€
  │   • Reçue le: 28/01/2026
  │   • Statut: En attente de paiement
  │   [📥 Voir]
```

---

## 🧪 Tests à effectuer

### Test 1 : Création du compte talent
- [ ] Créer un compte utilisateur avec role = TALENT
- [ ] Lier ce compte à un profil Talent (Talent.userId)
- [ ] Se connecter avec ce compte

### Test 2 : Upload impossible si pas PUBLIE
- [ ] Créer une collaboration EN_COURS
- [ ] Se connecter en tant que talent
- [ ] Vérifier que la section upload n'apparaît PAS

### Test 3 : Upload facture
- [ ] Collaboration passe en PUBLIE
- [ ] Se connecter en tant que talent
- [ ] Vérifier que section bleue apparaît
- [ ] Vérifier montant net affiché
- [ ] Cliquer "Choisir ma facture"
- [ ] Sélectionner un PDF
- [ ] Cliquer "Envoyer"
- [ ] Vérifier upload réussi
- [ ] Vérifier notification reçue par TM
- [ ] Vérifier notification reçue par ADMIN

### Test 4 : Affichage facture reçue
- [ ] Après upload, vérifier section verte apparaît
- [ ] Vérifier date affichée
- [ ] Vérifier statut "En attente de paiement"
- [ ] Cliquer "Télécharger" → fichier s'ouvre

### Test 5 : Après paiement
- [ ] ADMIN marque talent comme payé
- [ ] Talent recharge la page
- [ ] Vérifier "✅ Payé le XX/XX/XXXX" affiché

### Test 6 : Sécurité
- [ ] Tenter d'uploader en tant qu'autre talent → Erreur 403
- [ ] Tenter d'uploader 2 fois → Erreur 400
- [ ] Tenter d'uploader un fichier .exe → Erreur 400
- [ ] Tenter d'uploader un fichier > 10MB → Erreur 400

---

## 📈 Améliorations futures possibles

### 1. Validation du montant
Demander au talent de confirmer le montant de sa facture (vérifier qu'il correspond au montant net).

### 2. Historique des uploads
Si le talent remplace sa facture (avec autorisation ADMIN), garder un historique.

### 3. Génération automatique
Proposer un template de facture pré-rempli que le talent peut télécharger et signer.

### 4. Signature électronique
Intégrer un système de signature électronique directement dans la plateforme.

### 5. Rappels automatiques
Envoyer un email au talent X jours après publication si pas de facture uploadée.

---

## ✅ Résumé

**Le système d'upload de facture talent est maintenant complet !** 

✅ Le talent connecté peut uploader sa facture quand la collab est PUBLIÉE  
✅ Upload sécurisé vers Cloudinary  
✅ Notifications automatiques au TM et ADMIN  
✅ Interface intuitive avec feedback visuel  
✅ Validation complète (format, taille, permissions)  
✅ Intégration dans la vue "Dossiers Complets"  

**Le workflow de bout en bout est maintenant fonctionnel !** 🎉
