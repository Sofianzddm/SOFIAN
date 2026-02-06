# 🔔 SYSTÈME DE NOTIFICATIONS - Documentation Complète

Date : 27 Janvier 2026

---

## 🎯 FONCTIONNALITÉ

Système complet de notifications avec validation des factures talents en 2 étapes :

1. **Maud (ADMIN)** reçoit notification quand un talent envoie sa facture
2. **Maud valide** la facture comme "Conforme"
3. **Le talent** voit le statut "✅ Conforme et enregistrée"
4. **Plus tard**, Maud marque comme "💰 Payé"

---

## 📊 WORKFLOW COMPLET

```
1. TALENT upload sa facture
   ↓
2. Collaboration.statut → "FACTURE_RECUE"
   ↓
3. 🔔 Notification créée pour :
   - TM (manager)
   - ADMIN (Maud)
   ↓
4. Maud voit notification dans l'onglet "Notifications"
   Badge rouge (3) sur 🔔 dans le header
   ↓
5. Maud clique sur notification
   → Redirigée vers /collaborations/[id]
   ↓
6. Maud clique "✓ Marquer conforme"
   ↓
7. Collaboration.factureValidee = true
   Collaboration.factureValideeAt = Date actuelle
   ↓
8. 🔔 Notification créée pour le TALENT :
   "✅ Facture validée - Conforme et enregistrée"
   ↓
9. TALENT voit sur sa page collab :
   ✅ Conforme et enregistrée
   Validée le 27/01/2026
   ↓
10. Plus tard, Maud clique "💰 Payé"
    ↓
11. Collaboration.statut → "PAYE"
    Collaboration.paidAt = Date actuelle
    ↓
12. TALENT voit :
    ✅ Conforme et enregistrée
    💰 Payé le 15/02/2026
```

---

## 🗂️ FICHIERS CRÉÉS/MODIFIÉS

### **1. API Notifications**

#### `/src/app/api/notifications/route.ts`
```typescript
GET /api/notifications
GET /api/notifications?nonLues=true

Retourne :
{
  notifications: Notification[],
  countNonLues: number
}
```

#### `/src/app/api/notifications/[id]/route.ts`
```typescript
PATCH /api/notifications/:id

Marque une notification comme lue
```

#### `/src/app/api/collaborations/[id]/valider-facture/route.ts`
```typescript
POST /api/collaborations/:id/valider-facture

Actions :
1. Vérifie permissions (ADMIN uniquement)
2. Met à jour factureValidee = true
3. Met à jour factureValideeAt = Date actuelle
4. Crée notification pour le talent
```

---

### **2. Page Notifications**

#### `/src/app/(dashboard)/notifications/page.tsx`

**Features :**
- ✅ Liste de toutes les notifications
- ✅ Filtres : "Toutes" / "Non lues"
- ✅ Badge rouge sur notifications non lues
- ✅ Bouton "Voir" → redirection vers lien
- ✅ Bouton "Marquer conforme" (visible uniquement pour FACTURE_RECUE + ADMIN)
- ✅ Bouton "Marquer comme lu"
- ✅ Icônes différentes par type (💰, 🎉, 📢, 🔔)

**Accès :**
- Tous les rôles (ADMIN, HEAD_OF, TM, CM, TALENT)

---

### **3. Header avec Compteur**

#### `/src/components/layout/header.tsx`

**Modifications :**
- ✅ Compteur dynamique de notifications non lues
- ✅ Badge rouge avec nombre (ex: "3") ou "9+" si > 9
- ✅ Rafraîchissement automatique toutes les 30 secondes
- ✅ Clic sur 🔔 → redirection vers `/notifications`

---

### **4. Sidebar avec Lien**

#### `/src/components/layout/sidebar.tsx`

**Ajout :**
- ✅ Lien "Notifications" avec icône 🔔
- ✅ Visible pour tous les rôles
- ✅ Placé en 2ème position (après Dashboard)

---

### **5. Page Collaboration - Affichage Talent**

#### `/src/app/(dashboard)/collaborations/[id]/page.tsx`

**Modifications :**

**Avant :**
```
✅ Facture reçue
Envoyée le 26/01/2026
⏳ En attente de paiement
```

**Maintenant :**
```
✅ Facture reçue
Envoyée le 26/01/2026

SI factureValidee = false :
⏳ En cours de vérification

SI factureValidee = true :
✅ Conforme et enregistrée
Validée le 27/01/2026

SI paidAt existe :
💰 Payé le 15/02/2026
```

---

### **6. Schéma Prisma**

#### `/prisma/schema.prisma`

**Modifications du modèle Collaboration :**
```prisma
model Collaboration {
  // ... autres champs
  
  factureTalentUrl      String?
  factureTalentRecueAt  DateTime?
  factureValidee        Boolean   @default(false)  // ✅ NOUVEAU
  factureValideeAt      DateTime?                  // ✅ NOUVEAU
  
  paidAt            DateTime?
}
```

**Modification de l'enum TypeNotification :**
```prisma
enum TypeNotification {
  NOUVEAU_TALENT
  NOUVELLE_MARQUE
  BILAN_RETARD
  COLLAB_PUBLIE
  FACTURE_RECUE
  FACTURE_VALIDEE    // ✅ NOUVEAU
  FACTURE_RELANCE
  COLLAB_GAGNEE
  PAIEMENT_RECU
  GENERAL
}
```

---

## 🗄️ MIGRATION BASE DE DONNÉES

### **Fichier : `MIGRATION_NOTIFICATIONS.sql`**

```sql
-- 1. Ajouter colonnes factureValidee et factureValideeAt
ALTER TABLE "collaborations" 
ADD COLUMN "factureValidee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "factureValideeAt" TIMESTAMP(3);

-- 2. Ajouter type de notification FACTURE_VALIDEE
ALTER TYPE "TypeNotification" ADD VALUE 'FACTURE_VALIDEE';
```

**À exécuter sur Neon :**
1. Aller sur console Neon
2. SQL Editor
3. Copier/coller le contenu de `MIGRATION_NOTIFICATIONS.sql`
4. Exécuter

---

## 🔒 PERMISSIONS

### **Qui peut voir les notifications ?**
| Rôle | Voir page | Recevoir notifs | Valider factures |
|------|-----------|-----------------|------------------|
| **ADMIN** | ✅ Oui | ✅ Oui | ✅ Oui |
| **HEAD_OF** | ✅ Oui | ✅ Oui | ❌ Non |
| **TM** | ✅ Oui | ✅ Oui (ses talents) | ❌ Non |
| **CM** | ✅ Oui | ❌ Non | ❌ Non |
| **TALENT** | ✅ Oui | ✅ Oui (ses collabs) | ❌ Non |

### **Qui peut marquer une facture comme "Conforme" ?**
- ✅ **ADMIN uniquement** (Maud)

### **Qui peut marquer comme "Payé" ?**
- ✅ **ADMIN uniquement** (Maud)

---

## 📱 INTERFACE UTILISATEUR

### **1. Header**
```
┌────────────────────────────────────────────────────────┐
│  [🔍 Recherche...]              [🔔 3]  [👤 Maud]      │
└────────────────────────────────────────────────────────┘
```

### **2. Page Notifications**
```
┌────────────────────────────────────────────────────────┐
│  🔔 Notifications                                      │
│  3 notification(s) non lue(s)                          │
│                                                         │
│  [Toutes (12)] [Non lues (3)]                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │ 💰  📤 Facture talent reçue              ⚫       │ │
│  │     Eline Collange a uploadé sa facture pour    │ │
│  │     COLLAB-2026-0123 (L'Oréal Paris)             │ │
│  │     27 janvier 2026, 14:32                       │ │
│  │                                                   │ │
│  │     [Voir] [✓ Marquer conforme] [Marquer lu]    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │ 🎉  🎉 Nouveau talent ajouté                     │ │
│  │     Eline Collange a été ajouté par Marie...    │ │
│  │     26 janvier 2026, 10:15                       │ │
│  │                                                   │ │
│  │     [Voir] [Marquer lu]                          │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### **3. Page Collaboration (Talent)**
```
┌────────────────────────────────────────────────────────┐
│  ✅ Facture reçue                    [Télécharger]    │
│  Envoyée le 26/01/2026                                │
│                                                         │
│  ✅ Conforme et enregistrée                            │
│  Validée le 27/01/2026                                 │
│                                                         │
│  💰 Payé le 15/02/2026                                 │
└────────────────────────────────────────────────────────┘
```

---

## 🔄 TYPES DE NOTIFICATIONS

### **FACTURE_RECUE** (Envoyé à ADMIN + TM)
```json
{
  "type": "FACTURE_RECUE",
  "titre": "📤 Facture talent reçue",
  "message": "Eline Collange a uploadé sa facture pour COLLAB-2026-0123 (L'Oréal Paris)",
  "lien": "/collaborations/xxx",
  "collabId": "xxx"
}
```

### **FACTURE_VALIDEE** (Envoyé au TALENT)
```json
{
  "type": "FACTURE_VALIDEE",
  "titre": "✅ Facture validée",
  "message": "Votre facture pour COLLAB-2026-0123 a été vérifiée et enregistrée. Elle est conforme !",
  "lien": "/collaborations/xxx",
  "collabId": "xxx"
}
```

---

## 🧪 TESTS À EFFECTUER

### **Test 1 : Upload facture par talent**
1. [ ] Se connecter en tant que TALENT
2. [ ] Aller sur une collab "PUBLIE"
3. [ ] Uploader une facture
4. [ ] Vérifier que statut → "FACTURE_RECUE"
5. [ ] Vérifier que "⏳ En cours de vérification" apparaît

### **Test 2 : Notification reçue par Maud**
1. [ ] Se connecter en tant que ADMIN (Maud)
2. [ ] Voir badge rouge (1) sur 🔔 dans header
3. [ ] Cliquer sur 🔔
4. [ ] Vérifier notification "📤 Facture talent reçue"
5. [ ] Cliquer "Voir" → redirigée vers collab

### **Test 3 : Validation facture par Maud**
1. [ ] Sur la page notification (ou collab directement)
2. [ ] Cliquer "✓ Marquer conforme"
3. [ ] Vérifier message "✅ Facture validée comme conforme !"
4. [ ] Vérifier que notification devient "lue"

### **Test 4 : Talent voit "Conforme"**
1. [ ] Se reconnecter en tant que TALENT
2. [ ] Voir badge rouge (1) sur 🔔
3. [ ] Cliquer → notification "✅ Facture validée"
4. [ ] Aller sur la collab
5. [ ] Vérifier "✅ Conforme et enregistrée"
6. [ ] Vérifier date de validation affichée

### **Test 5 : Marquer comme payé**
1. [ ] Se connecter en tant que ADMIN
2. [ ] Aller sur la collab
3. [ ] Cliquer "Payé" dans actions
4. [ ] Vérifier que statut → "PAYE"
5. [ ] Talent voit "💰 Payé le XX/XX/XXXX"

### **Test 6 : Permissions**
1. [ ] HEAD_OF ne voit PAS bouton "Marquer conforme"
2. [ ] TM ne voit PAS bouton "Marquer conforme"
3. [ ] TM ne peut PAS accéder à l'API (403)
4. [ ] HEAD_OF ne peut PAS accéder à l'API (403)

---

## 🚀 DÉPLOIEMENT

### **1. Migration Base de Données**
```bash
# Sur Neon Console
# Exécuter MIGRATION_NOTIFICATIONS.sql
```

### **2. Régénérer Client Prisma**
```bash
npx prisma generate
```

### **3. Redémarrer le serveur**
```bash
# Arrêter tous les dev servers
# Supprimer cache Next.js
rm -rf .next
# Relancer
npm run dev
```

---

## ✅ RÉSUMÉ

**Ce qui a été créé :**
- ✅ API complète de notifications (GET, PATCH)
- ✅ Page `/notifications` avec filtres et actions
- ✅ Header avec compteur dynamique
- ✅ Sidebar avec lien notifications
- ✅ Endpoint validation facture (`/valider-facture`)
- ✅ Affichage statut "Conforme" pour talents
- ✅ Nouveaux champs DB (factureValidee, factureValideeAt)
- ✅ Nouveau type notification (FACTURE_VALIDEE)
- ✅ Permissions ADMIN uniquement pour validation
- ✅ Workflow complet bout en bout

**Maud peut maintenant :**
1. ✅ Recevoir des notifications quand talents envoient factures
2. ✅ Voir le badge rouge (compteur) dans le header
3. ✅ Cliquer sur 🔔 pour voir toutes les notifications
4. ✅ Cliquer "Marquer conforme" sur une facture
5. ✅ Le talent reçoit notification et voit "Conforme"
6. ✅ Plus tard, marquer comme "Payé"

**Le système est complet et prêt à l'emploi ! 🎉**
