# 🧪 GUIDE TEST - Upload Facture Talent

## ✅ Statut : TOUT EST CONNECTÉ

- ✅ Cloudinary configuré
- ✅ Auth NextAuth supporte les TALENTS
- ✅ Dashboard accessible aux TALENTS
- ✅ Collaborations visibles pour TALENTS
- ✅ Endpoint d'upload créé

---

## 🎯 ÉTAPES DE TEST

### 1️⃣ Créer un compte TALENT

#### Option A : Via Prisma Studio (RECOMMANDÉ) ⭐
```bash
npx prisma studio
```

1. **Créer le User** :
   - Aller dans `User` → Cliquer "Add record"
   - **email** : `talent@test.com`
   - **password** : `$2a$10$yL0Tcx1.UT2tHU9vU6NqbuzxEZXtexVueRHnDFRtrUGpvpnFxjczq`
   - **prenom** : `Eline`
   - **nom** : `Test`
   - **role** : `TALENT`
   - **actif** : `true`
   - **Sauvegarder** → Noter l'ID généré (ex: `clxxxxx...`)

2. **Lier au Talent** :
   - Aller dans `Talent` → Sélectionner un talent existant
   - Modifier le champ **userId** avec l'ID du User créé
   - **Sauvegarder**

> **Mot de passe** : `password123`

---

### 2️⃣ Se connecter en tant que TALENT

1. Ouvrir ton navigateur : `http://localhost:3000/login`
2. Entrer :
   - **Email** : `talent@test.com`
   - **Mot de passe** : `password123`
3. Cliquer "Se connecter"
4. ✅ Tu dois être redirigé vers `/dashboard`

---

### 3️⃣ Accéder aux collaborations

1. Dans la sidebar, cliquer sur **"Collaborations"**
2. ✅ Tu dois voir uniquement **TES** collaborations (celles du talent lié)
3. Sélectionner une collaboration avec statut **PUBLIE**

Si aucune collab n'est PUBLIE :
```sql
-- Mettre une collab en PUBLIE (via Prisma Studio)
UPDATE collaborations
SET statut = 'PUBLIE'
WHERE id = 'COLLAB_ID_ICI';
```

---

### 4️⃣ Uploader la facture

1. Ouvrir la collaboration **PUBLIE**
2. ✅ Une **section bleue** doit apparaître :
   ```
   📄 Uploadez votre facture
   
   La collaboration est publiée !
   Vous pouvez maintenant uploader votre facture.
   
   Montant net à facturer : X XXX€
   
   [📤 Choisir ma facture]
   ```

3. Cliquer **"Choisir ma facture"**
4. Sélectionner un fichier (PDF, JPG ou PNG)
5. Le fichier apparaît → Cliquer **"Envoyer"**
6. ⏳ Loader "Envoi..."
7. ✅ Message de succès : "Facture uploadée avec succès !"

---

### 5️⃣ Vérifier après upload

#### Côté TALENT :
1. La page se recharge
2. ✅ **Section verte** apparaît :
   ```
   ✅ Facture reçue
   
   Envoyée le 26/01/2026
   ⏳ En attente de paiement
   
   [Télécharger]
   ```

#### Côté TM / ADMIN :
1. Se déconnecter du compte TALENT
2. Se reconnecter en ADMIN/TM
3. Aller dans **Notifications** → ✅ Voir notification "📤 Facture talent reçue"
4. Ouvrir la collaboration → ✅ Voir la facture dans les détails

#### Côté ADMIN - Dossiers :
1. Se connecter en ADMIN
2. Aller dans **Dossiers** (sidebar)
3. Déplier le talent → Déplier le mois → Déplier la collab
4. ✅ Voir la section :
   ```
   5. 📤 Facture Talent
      • Montant: X XXX€
      • Reçue le: 26/01/2026
      • Statut: En attente de paiement
      [📥 Voir]
   ```

---

## 🔍 CHECKLIST DE VÉRIFICATION

### ✅ Sécurité
- [ ] Un autre TALENT ne peut PAS uploader pour cette collab (403)
- [ ] Impossible d'uploader si statut ≠ PUBLIE (400)
- [ ] Impossible d'uploader 2 fois (400)
- [ ] Impossible d'uploader un .exe (400)
- [ ] Impossible d'uploader un fichier > 10MB (400)

### ✅ Fonctionnel
- [ ] Section bleue visible uniquement si PUBLIE + pas de facture
- [ ] Montant net affiché correctement
- [ ] Upload réussit
- [ ] Section verte apparaît après upload
- [ ] Bouton télécharger fonctionne
- [ ] Notifications envoyées (TM + ADMIN)
- [ ] Statut collab passe à FACTURE_RECUE
- [ ] Facture visible dans /dossiers (ADMIN)

### ✅ UX
- [ ] Loader pendant l'upload
- [ ] Message de succès clair
- [ ] Nom du fichier affiché avant envoi
- [ ] Formats acceptés indiqués
- [ ] Taille max indiquée
- [ ] Boutons bien visibles

---

## 🐛 Résolution de problèmes

### Erreur "Non authentifié"
➡️ Tu n'es pas connecté → Retour à `/login`

### Erreur "Vous n'êtes pas autorisé..."
➡️ Tu n'es pas le talent propriétaire de cette collab
➡️ Vérifie que `Talent.userId` correspond bien à ton `User.id`

### Erreur "Collaboration non trouvée"
➡️ L'ID de la collab n'existe pas
➡️ Vérifie l'URL : `/collaborations/[id]`

### Erreur "Mauvais statut"
➡️ La collab n'est pas PUBLIE
➡️ Change le statut en PUBLIE via Prisma Studio

### Erreur "Format non accepté"
➡️ Le fichier n'est ni PDF, ni JPG, ni PNG
➡️ Convertis ton fichier ou choisis un autre

### Erreur "Fichier trop volumineux"
➡️ Le fichier fait > 10MB
➡️ Compresse ton fichier ou choisis un autre

### Section bleue n'apparaît pas
➡️ Vérifie que :
  - Tu es connecté en TALENT
  - La collab est PUBLIE
  - Pas de facture déjà uploadée
  - Tu as bien rechargé la page

---

## 📊 Données de test recommandées

### Créer une collab de test complète :

```sql
-- 1. Créer une négociation VALIDEE
INSERT INTO negociations (...)
VALUES (...);

-- 2. Créer une collaboration PUBLIE liée
INSERT INTO collaborations (
  id,
  reference,
  "talentId",
  "marqueId",
  "negociationId",
  "dateDebut",
  montant,
  "commissionPct",
  "commissionEuros",
  "montantNet",
  statut,
  "createdAt",
  "updatedAt"
)
VALUES (
  'test_collab_001',
  'COLLAB-2026-TEST',
  'ton_talent_id',
  'une_marque_id',
  'nego_id',
  NOW(),
  2800,
  20,
  560,
  2240,
  'PUBLIE',
  NOW(),
  NOW()
);
```

---

## 🎓 Workflow complet de A à Z

```
1. ADMIN crée une marque
   ↓
2. TM crée une négociation (BROUILLON)
   ↓
3. TM soumet la négociation (EN_ATTENTE)
   ↓
4. HEAD_OF valide (VALIDEE)
   ↓
5. TM crée une collaboration liée
   ↓
6. TM publie la collaboration (PUBLIE)
   ↓
7. TALENT se connecte
   ↓
8. TALENT va sur /collaborations
   ↓
9. TALENT ouvre sa collab PUBLIE
   ↓
10. TALENT voit section bleue "Upload facture"
   ↓
11. TALENT upload sa facture
   ↓
12. TM reçoit notification
   ↓
13. ADMIN reçoit notification
   ↓
14. ADMIN va dans /dossiers
   ↓
15. ADMIN voit la facture talent
   ↓
16. ADMIN télécharge la facture
   ↓
17. ADMIN marque le talent comme payé
   ↓
18. TALENT voit "✅ Payé le XX/XX/XXXX"
```

---

## 🎉 C'EST PRÊT !

Tout est connecté, configuré et fonctionnel ! 🚀

Il ne reste plus qu'à :
1. ✅ Créer un compte TALENT
2. ✅ Se connecter
3. ✅ Tester l'upload

Besoin d'aide ? Regarde les logs :
```bash
# Terminal 1 : Dev server
npm run dev

# Terminal 2 : Logs API
tail -f .next/trace

# Terminal 3 : Prisma Studio
npx prisma studio
```

---

**BON TEST ! 💪**
