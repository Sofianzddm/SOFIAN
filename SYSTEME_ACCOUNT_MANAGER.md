# 💼 Système d'Assignation Account Manager - Documentation

## Vue d'ensemble

Le système permet aux **HEAD_OF_SALES** (comme Leyna) d'assigner un **Account Manager** (comme Ines) pour gérer le suivi des collaborations après avoir deal avec les marques.

## 🔄 Workflow Complet

```
┌─────────────────────────────────────────────────────────────┐
│  1️⃣  PROSPECTION                                             │
│  → HEAD_OF_SALES (Leyna) prospecte les marques             │
│  → Crée des négociations                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  2️⃣  NÉGOCIATION & DEAL                                      │
│  → Leyna négocie avec la marque                            │
│  → Deal signé → Collaboration créée (statut GAGNE)         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  3️⃣  ASSIGNATION ACCOUNT MANAGER                            │
│  → Leyna assigne Ines (Account Manager)                    │
│  → Bouton "Assigner à l'Account Manager"                   │
│  → Date d'assignation enregistrée                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  4️⃣  SUIVI PAR L'ACCOUNT MANAGER                            │
│  → Ines prend en charge le suivi complet                   │
│  → Gère la production                                       │
│  → Suit la publication                                      │
│  → Gère la facturation                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 👥 Rôles et Responsabilités

### 👩‍💼 **HEAD_OF_SALES (Leyna)**

**Responsabilités :**
- ✅ Prospection des marques
- ✅ Négociations
- ✅ Signature des deals
- ✅ **Assigner un Account Manager** après le deal
- ✅ Vue globale de toutes les collaborations

**Ce qu'elle peut faire :**
```yaml
Collaborations:
  - Créer des collaborations
  - Assigner un Account Manager
  - Retirer un Account Manager
  - Modifier les collaborations
  - Voir toutes les collaborations

Gifts:
  - Voir toutes les demandes de gifts (lecture seule)
```

### 💼 **ACCOUNT MANAGER (Ines - Rôle CM)**

**Responsabilités :**
- ✅ **Suivi des collaborations** assignées par Leyna
- ✅ **Gestion des gifts** pour tous les talents
- ✅ Communication avec les talents et marques
- ✅ Suivi production → publication → facturation

**Ce qu'elle peut faire :**
```yaml
Collaborations:
  - Voir ses collaborations assignées
  - Dashboard dédié (/account-manager)
  - Gérer le suivi (commentaires, updates)
  - Suivre l'avancement

Gifts:
  - Voir toutes les demandes de gifts
  - Prendre en charge les demandes
  - Gérer le workflow complet
  - Contacter les marques
  - Suivre l'envoi et la réception
```

---

## 🗄️ Base de Données

### Modifications du modèle `Collaboration`

```prisma
model Collaboration {
  // ... champs existants ...
  
  // NOUVEAU: Account Manager assigné
  accountManagerId  String?
  accountManager    User?   @relation("AccountManagerCollabs", fields: [accountManagerId], references: [id])
  dateAssignationAM DateTime?
  
  // ... autres champs ...
}
```

### Modifications du modèle `User`

```prisma
model User {
  // ... champs existants ...
  
  // NOUVEAU: Collaborations gérées en tant qu'Account Manager
  collabsGerees     Collaboration[]  @relation("AccountManagerCollabs")
  
  // ... autres champs ...
}
```

---

## 🔌 API Créée

### `POST /api/collaborations/[id]/assigner-am`
**Assigner un Account Manager à une collaboration**

**Permissions :** HEAD_OF_SALES, ADMIN uniquement

```typescript
// Request
{
  "accountManagerId": "user_id_ines"
}

// Response
{
  "id": "collab_id",
  "reference": "COL-2026-0123",
  "accountManagerId": "user_id_ines",
  "dateAssignationAM": "2026-01-26T...",
  "accountManager": {
    "id": "user_id_ines",
    "prenom": "Ines",
    "nom": "...",
    "email": "ines@glowup.com"
  },
  // ... autres données
}
```

### `DELETE /api/collaborations/[id]/assigner-am`
**Retirer l'assignation d'un Account Manager**

**Permissions :** HEAD_OF_SALES, ADMIN uniquement

### `GET /api/collaborations?accountManagerId=xxx`
**Filtrer les collaborations par Account Manager**

```typescript
// Récupérer les collaborations d'Ines
GET /api/collaborations?accountManagerId=user_id_ines
```

---

## 🎨 Interfaces Créées

### 1. **Dashboard Account Manager** (`/account-manager`)

**URL :** `/account-manager`  
**Accès :** CM (Account Manager) et ADMIN uniquement

**Fonctionnalités :**
- 📊 Stats en temps réel :
  - Total de collaborations assignées
  - Collaborations en cours
  - Collaborations publiées
  - Demandes de gifts
  - Gifts en cours de traitement

- 📋 Liste des collaborations assignées :
  - Filtres par statut
  - Recherche par référence, talent ou marque
  - Vue carte avec détails complets
  - Lien vers chaque collaboration

- 🎁 Accès rapide aux Gifts :
  - Bouton vers la page des gifts
  - Nombre de demandes en attente

**Exemple d'affichage :**
```
┌─────────────────────────────────────────────┐
│ Dashboard Account Manager                   │
│ Gérez vos collaborations et les gifts      │
└─────────────────────────────────────────────┘

Stats:
├─ Mes collaborations: 12
├─ En cours: 5
├─ Publiées: 3
├─ Demandes gifts: 8
└─ Gifts en cours: 4

Mes collaborations assignées:
├─ COL-2026-0123 | Talent A | Marque X | 5,000€
├─ COL-2026-0124 | Talent B | Marque Y | 8,000€
└─ ...
```

### 2. **Bouton d'assignation** (dans la page collaboration)

Sur la page de détails d'une collaboration (`/collaborations/[id]`), si vous êtes **HEAD_OF_SALES** :

```typescript
// À ajouter dans la page de détails
<AssignerAMButton 
  collaborationId={collab.id}
  accountManagerActuel={collab.accountManager}
  onAssign={() => refetch()}
/>
```

**Composant à créer :**
- Liste déroulante des Account Managers (CM)
- Bouton "Assigner"
- Badge montrant l'AM actuel
- Bouton pour retirer l'assignation

---

## 📋 Sidebar - Nouvelle Entrée

Dans la sidebar, nouvelle entrée :

```typescript
{
  label: "Account Manager",
  href: "/account-manager",
  icon: UserCog,
  roles: ["CM", "ADMIN"],
}
```

**Visible par :** Account Managers (CM) et Admins uniquement

---

## 🔐 Permissions Récapitulatives

| Rôle | Créer Collab | Assigner AM | Voir ses Collabs | Gérer Gifts |
|------|-------------|-------------|-----------------|-------------|
| **HEAD_OF_SALES** | ✅ | ✅ | ✅ (toutes) | ❌ (lecture) |
| **ACCOUNT_MANAGER (CM)** | ❌ | ❌ | ✅ (assignées) | ✅ |
| **ADMIN** | ✅ | ✅ | ✅ (toutes) | ✅ |
| **TM** | ✅ | ❌ | ✅ (ses talents) | ✅ (ses demandes) |

---

## 🚀 Migration & Déploiement

### Étape 1 : Appliquer la migration Prisma

```bash
# Générer le client Prisma
npx prisma generate

# Appliquer les changements
npx prisma db push
```

### Étape 2 : Créer un utilisateur Account Manager

Si Ines n'existe pas encore :

```bash
# Via Prisma Studio
npx prisma studio

# Puis créer :
email: ines@glowup.com
role: CM (Community Manager = Account Manager)
prenom: Ines
nom: [nom de famille]
actif: true
```

### Étape 3 : Vérifier le rôle de Leyna

```sql
-- Vérifier que Leyna a le rôle HEAD_OF_SALES
SELECT id, email, prenom, nom, role 
FROM users 
WHERE email = 'leyna@glowup.com';

-- Si besoin, mettre à jour :
UPDATE users 
SET role = 'HEAD_OF_SALES' 
WHERE email = 'leyna@glowup.com';
```

---

## 🎯 Scénario d'Utilisation Complet

### Exemple : Collaboration avec la marque "BeautyBrand"

**Jour 1 - Prospection (Leyna)**
```
1. Leyna contacte BeautyBrand
2. Crée une négociation dans le système
3. Négocie les termes
```

**Jour 3 - Deal signé (Leyna)**
```
4. Deal validé !
5. Leyna crée la collaboration COL-2026-0150
   - Talent: Sophie Martin
   - Marque: BeautyBrand
   - Montant: 8,000€
   - Statut: GAGNE
```

**Jour 3 - Assignation (Leyna)**
```
6. Leyna va sur /collaborations/COL-2026-0150
7. Clique sur "Assigner à l'Account Manager"
8. Sélectionne "Ines" dans la liste
9. Valide → Ines reçoit la collaboration
```

**Jour 4-30 - Suivi (Ines)**
```
10. Ines voit la nouvelle collab dans son dashboard /account-manager
11. Elle contacte Sophie (le talent) pour brief
12. Suit la production du contenu
13. Valide la publication
14. Gère la facturation
15. Suit le paiement
```

**Pendant ce temps - Gifts (Ines)**
```
- Reçoit 3 demandes de gifts de TMs
- Prend en charge les demandes
- Contacte les marques
- Gère les envois
- Confirme les réceptions
```

---

## 📊 Notifications (À implémenter)

### Pour Ines (Account Manager)
```
✉️ "Nouvelle collaboration assignée"
   → COL-2026-0150 | Sophie Martin | BeautyBrand
   → Assignée par Leyna

🎁 "Nouvelle demande de gift"
   → GIFT-2026-0042 | Marie Dupont | Produit X
   → Créée par TM John
```

### Pour Leyna (HEAD_OF_SALES)
```
✅ "Account Manager assigné"
   → Ines a été assignée à COL-2026-0150

📝 "Update de collaboration"
   → Ines a mis à jour COL-2026-0150
   → Statut: EN_COURS → PUBLIE
```

---

## 🔄 Intégration avec les Gifts

Les Account Managers (CM) gèrent **deux choses** :

1. **Collaborations assignées** par les HEAD_OF_SALES
   - Dashboard : `/account-manager`
   - Focus : Suivi après le deal

2. **Demandes de Gifts** de tous les TM
   - Dashboard : `/gifts`
   - Focus : Obtenir des produits gratuits

**Navigation claire :**
```
/account-manager → Dashboard principal
  ├─ Mes collaborations assignées
  └─ Lien vers /gifts

/gifts → Gestion des gifts
  ├─ Toutes les demandes
  └─ Workflow complet
```

---

## ✅ Checklist de Mise en Production

- [ ] Migration Prisma appliquée
- [ ] Utilisateur Ines créé avec rôle CM
- [ ] Utilisateur Leyna avec rôle HEAD_OF_SALES
- [ ] Page `/account-manager` accessible
- [ ] Bouton d'assignation fonctionnel sur collaborations
- [ ] API d'assignation testée
- [ ] Sidebar mise à jour
- [ ] Tests avec un cas réel

---

## 📞 Support & Questions

**Workflow unclear ?**
- Leyna fait la prospection et négocie
- Après le deal, elle assigne Ines
- Ines prend le relais pour le suivi

**Qui gère quoi ?**
- Prospection → Leyna (HEAD_OF_SALES)
- Suivi collaboration → Ines (Account Manager)
- Gifts → Ines (Account Manager)

---

**Créé le :** 26 janvier 2026  
**Version :** 1.0  
**Status :** ✅ Ready to Deploy

**Prochaines étapes :**
1. Appliquer la migration
2. Créer les utilisateurs
3. Tester le workflow complet
4. Former les équipes
