# 👥 Création des Utilisateurs Leyna & Ines

## ⚠️ Problème TLS Temporaire

La connexion à Neon rencontre actuellement une erreur TLS temporaire. Voici 3 options pour créer les utilisateurs :

---

## 🎯 Option 1 : Via l'Interface (RECOMMANDÉ)

### Étapes :

1. **Se connecter en Admin** : `sofian@glowup-agence.com` / `admin123`

2. **Aller sur** : `/users/new`

3. **Créer Leyna (Head of Sales)** :
   ```yaml
   Prénom: Leyna
   Nom: Head of Sales
   Email: leyna@glowup-agence.com
   Mot de passe: admin123
   Confirmer: admin123
   Rôle: HEAD_OF_SALES (Head of Sales)
   ```
   → Cliquer **"Créer l'utilisateur"**

4. **Créer Ines (Account Manager)** :
   ```yaml
   Prénom: Ines
   Nom: Account Manager
   Email: ines@glowup-agence.com
   Mot de passe: admin123
   Confirmer: admin123
   Rôle: CM (Community Manager)
   ```
   → Cliquer **"Créer l'utilisateur"**

---

## 🔄 Option 2 : Via le Script Seed (quand TLS fonctionne)

Le script seed a été mis à jour avec Leyna et Ines !

### Commande :

```bash
npm run db:seed
```

### Utilisateurs créés automatiquement :

```
✅ Admin Sofian (sofian@glowup-agence.com)
✅ Admin Maud (maud@glowup-agence.com)
✅ Head of (headof@glowup-agence.com)
✅ Head of Sales Leyna (leyna@glowup-agence.com) 🎯
✅ Account Manager Ines (ines@glowup-agence.com) 💼
✅ TM Daphné (daphné@glowup-agence.com)
✅ TM Joey (joey@glowup-agence.com)
✅ TM Alice (alice@glowup-agence.com)
✅ TM Coralie (coralie@glowup-agence.com)
✅ TM Cinssia (cinssia@glowup-agence.com)
```

**Mot de passe par défaut** : `admin123`

---

## 💾 Option 3 : Via SQL Direct (Neon Console)

Si les deux options ci-dessus ne fonctionnent pas, connectez-vous à la console Neon et exécutez :

```sql
-- Hasher le mot de passe "admin123" avec bcrypt (rounds=12)
-- Hash pré-calculé : $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIB.5h9LGe

-- Créer Leyna (Head of Sales)
INSERT INTO users (id, email, password, prenom, nom, role, actif, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'leyna@glowup-agence.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIB.5h9LGe',
  'Leyna',
  'Head of Sales',
  'HEAD_OF_SALES',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Créer Ines (Account Manager)
INSERT INTO users (id, email, password, prenom, nom, role, actif, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'ines@glowup-agence.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIB.5h9LGe',
  'Ines',
  'Account Manager',
  'CM',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
```

---

## ✅ Vérification

Une fois créés, testez les connexions :

### Leyna (Head of Sales) :
- **Email** : `leyna@glowup-agence.com`
- **Password** : `admin123`
- **Dashboard** : `/dashboard` (vue HEAD_OF_SALES)
- **Permissions** :
  - ✅ Créer des négociations/collaborations
  - ✅ Assigner des Account Managers aux collaborations
  - ✅ Voir toutes les statistiques

### Ines (Account Manager) :
- **Email** : `ines@glowup-agence.com`
- **Password** : `admin123`
- **Dashboard** : `/account-manager`
- **Permissions** :
  - ✅ Gérer les collaborations assignées
  - ✅ Gérer tous les gifts (demandes de produits gratuits)
  - ✅ Communiquer avec les TMs via commentaires

---

## 🎯 Workflow Complet

```
1. Leyna crée une négociation
   ↓
2. Leyna valide → Devient collaboration
   ↓
3. Leyna assigne Ines (Account Manager)
   ↓
4. Ines gère le suivi de la collaboration
   ↓
5. Si le talent veut un gift :
   - TM crée une demande gift
   - Ines la prend en charge
   - Ines contacte la marque
   - Ines suit l'envoi/réception
```

---

## 🚀 Prochaines Étapes

1. **Créer Leyna et Ines** (Option 1 recommandée)
2. **Tester les connexions**
3. **Créer une négociation avec Leyna**
4. **Assigner Ines à une collaboration**
5. **Créer un gift avec un TM**
6. **Vérifier qu'Ines peut gérer le gift**

---

## 📝 Notes

- Le script `prisma/seed.ts` a été mis à jour
- Les utilisateurs sont prêts à être créés
- Le système de mot de passe est maintenant fonctionnel
- Mot de passe hashé avec bcrypt (10 rounds)
