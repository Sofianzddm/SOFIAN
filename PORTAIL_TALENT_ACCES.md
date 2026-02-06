# 🔐 Accès au Portail Talent (Créateur)

## ❌ **Problème actuel**

Quand vous créez un **Talent** via `/talents/new`, cela crée uniquement une fiche talent dans la base de données, **mais PAS de compte utilisateur** pour se connecter !

```
Créer un talent via /talents/new
   ↓
✅ Talent créé dans la table "talents"
❌ AUCUN compte User créé
❌ Le talent ne peut PAS se connecter au portail
```

---

## ✅ **Solution : 2 options**

### **Option 1 : Créer le compte utilisateur manuellement** (Rapide)

1. **Allez sur** `/users/new` (en tant qu'Admin)
2. **Remplissez le formulaire** :
   ```yaml
   Prénom: [Prénom du talent]
   Nom: [Nom du talent]
   Email: [MÊME email que le talent]
   Mot de passe: [Mot de passe du talent]
   Confirmer: [Même mot de passe]
   Rôle: TALENT
   ```
3. **Cliquez sur "Créer l'utilisateur"**

⚠️ **Important** : Utilisez **exactement le même email** que le talent !

---

### **Option 2 : API d'activation du portail** (Automatisé)

J'ai créé une API pour activer automatiquement le portail :

**Endpoint** : `POST /api/talents/[id]/activer-portail`

**Body** :
```json
{
  "password": "motdepasse123"
}
```

**Ce que ça fait** :
1. Vérifie que le talent existe
2. Crée un compte `User` avec le rôle `TALENT`
3. Utilise l'email du talent
4. Hash le mot de passe avec bcrypt
5. Lie le compte au talent via `userId`

**Pour l'utiliser** : Je peux ajouter un bouton "🔓 Activer le portail" dans la page de détails du talent.

---

## 🎯 **Workflow complet**

### **Côté Admin** :

```
1. Créer le talent via /talents/new
   ↓
2. Aller sur /talents/[id] (fiche du talent)
   ↓
3. Cliquer sur "🔓 Activer le portail créateur"
   ↓
4. Entrer un mot de passe
   ↓
✅ Le talent peut maintenant se connecter !
```

### **Côté Talent** :

```
1. Aller sur /login
   ↓
2. Entrer email + mot de passe
   ↓
3. Redirection automatique vers /talent/dashboard
   ↓
✅ Accès au portail créateur !
```

---

## 📋 **Schéma de la base de données**

### **Table `User`** (Authentification)
```prisma
model User {
  id       String
  email    String  @unique
  password String  // Hash bcrypt
  prenom   String
  nom      String
  role     Role    // TALENT, TM, ADMIN, etc.
  actif    Boolean
  
  talent   Talent? @relation("UserTalent") // Lien optionnel
}
```

### **Table `Talent`** (Données du créateur)
```prisma
model Talent {
  id       String
  userId   String? @unique // Lien optionnel vers User
  user     User?   @relation("UserTalent")
  
  prenom   String
  nom      String
  email    String
  // ... tous les détails du talent
}
```

### **Relation** :
```
User (role: TALENT) ←→ Talent
     ↑                     ↑
     userId            userId
```

---

## 🚀 **Action immédiate**

Pour le talent que vous avez créé :

1. **Allez sur** : `/users/new`
2. **Créez un utilisateur** :
   - Email : **[email exact du talent]**
   - Mot de passe : `talent123` (ou autre)
   - Rôle : **TALENT**
3. **Testez la connexion** :
   - Email : **[email du talent]**
   - Password : `talent123`
4. **Vérifiez** : Vous devriez être redirigé vers `/talent/dashboard`

---

## 💡 **Pour améliorer l'expérience**

Voulez-vous que j'ajoute :
- ✅ Un bouton **"Activer le portail"** dans la fiche talent ?
- ✅ Une indication visuelle si le portail est activé ou non ?
- ✅ Une checkbox "Créer un compte utilisateur" lors de la création du talent ?

---

## ❓ **Diagnostic rapide**

Pour vérifier si un talent a déjà un compte :

1. Allez sur `/debug`
2. Entrez l'email du talent
3. Regardez si "Mot de passe : ✅ DÉFINI"

---

**Résumé** : Créer un talent ≠ Créer un compte. Il faut créer les deux !
