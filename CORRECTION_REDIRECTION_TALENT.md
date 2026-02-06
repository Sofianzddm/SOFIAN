# ✅ Correction : Redirection Talents

## 🐛 **Problème**

Les talents étaient redirigés vers `/dashboard` (admin) au lieu de `/talent/dashboard` (portail créateur), causant une erreur car l'API `/api/dashboard` ne gère pas le rôle `TALENT`.

---

## ✅ **Corrections apportées**

### 1. **Page de login** (`src/app/(auth)/login/page.tsx`)

**Avant** :
```typescript
// Redirection vers le dashboard
router.push("/dashboard");
```

**Après** :
```typescript
// Récupérer la session pour vérifier le rôle
const response = await fetch("/api/auth/session");
const session = await response.json();

// Redirection selon le rôle
if (session?.user?.role === "TALENT") {
  router.push("/talent/dashboard");
} else {
  router.push("/dashboard");
}
```

---

### 2. **Layout Dashboard** (`src/app/(dashboard)/layout.tsx`)

**Ajouté** : Protection pour rediriger les talents vers leur portail

```typescript
useEffect(() => {
  if (status === "unauthenticated") {
    router.push("/login");
  }
  // Rediriger les talents vers leur portail
  if (status === "authenticated" && session?.user?.role === "TALENT") {
    router.push("/talent/dashboard");
  }
}, [status, session, router]);
```

---

### 3. **API Dashboard** (`src/app/api/dashboard/route.ts`)

**Ajouté** : Rejet explicite des talents

```typescript
// Les talents ont leur propre dashboard
if (role === "TALENT") {
  return NextResponse.json({ 
    error: "Accès refusé. Veuillez utiliser le portail créateur." 
  }, { status: 403 });
}
```

---

## 🎯 **Workflow correct**

### **Connexion en tant que TALENT** :

```
1. Aller sur /login
   ↓
2. Entrer email + mot de passe du talent
   ↓
3. Connexion réussie
   ↓
4. ✅ Redirection automatique vers /talent/dashboard
   ↓
5. ✅ Affichage du portail créateur
```

### **Connexion en tant que ADMIN/TM/HEAD_OF** :

```
1. Aller sur /login
   ↓
2. Entrer email + mot de passe
   ↓
3. Connexion réussie
   ↓
4. ✅ Redirection automatique vers /dashboard
   ↓
5. ✅ Affichage du dashboard admin
```

---

## 🔒 **Protections en place**

| Route | Rôle autorisé | Redirection si non autorisé |
|-------|---------------|----------------------------|
| `/dashboard` | ADMIN, HEAD_OF, TM, CM | TALENT → `/talent/dashboard` |
| `/talent/dashboard` | TALENT | Autres → `/dashboard` |
| `/api/dashboard` | ADMIN, HEAD_OF, TM, CM | TALENT → Erreur 403 |

---

## 🚀 **Pour tester**

1. **Se déconnecter** (bouton en haut à droite)
2. **Se reconnecter** avec le compte talent :
   - Email : `[email du talent]`
   - Password : `talent123` (ou celui défini)
3. **Vérifier** : Vous devriez arriver sur `/talent/dashboard`
4. **Essayer d'aller sur** `/dashboard` : Redirection automatique vers `/talent/dashboard`

---

## ✅ **Résultat attendu**

```
✅ Talent connecté → /talent/dashboard
✅ Admin/TM connecté → /dashboard
✅ Talent ne peut plus accéder à /dashboard
✅ Plus d'erreur "Erreur lors du chargement"
```

---

## 📝 **Note**

Si le problème persiste après reconnexion :
1. Vider le cache du navigateur (Cmd+Shift+R sur Mac, Ctrl+Shift+R sur Windows)
2. Ou ouvrir en navigation privée
3. Se reconnecter
