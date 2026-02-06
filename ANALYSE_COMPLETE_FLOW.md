# 🔍 ANALYSE COMPLÈTE DU FLOW - TOUS LES PROBLÈMES IDENTIFIÉS

Date : 26 Janvier 2026

---

## 🚨 PROBLÈMES CRITIQUES IDENTIFIÉS

### 1. ❌ **CRÉATION DE TALENT - Pas de notification HEAD_OF**

**Problème :**
- Fichier : `/src/app/api/talents/route.ts` (ligne 124-200)
- Quand un talent est créé, **AUCUNE notification** n'est envoyée à la HEAD_OF
- La HEAD_OF ne sait pas qu'un nouveau talent a été ajouté
- Elle ne peut pas valider les tarifs

**Impact :**
- HEAD_OF n'est pas informée
- Tarifs non vérifiés
- Risque d'erreurs dans les négociations

**Solution requise :**
```typescript
// Après création du talent (ligne 200)
// 1. Récupérer toutes les HEAD_OF
const headsOf = await prisma.user.findMany({
  where: { 
    role: { in: ["HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"] },
    actif: true 
  },
});

// 2. Créer les notifications
await Promise.all(
  headsOf.map(head =>
    prisma.notification.create({
      data: {
        userId: head.id,
        type: "NOUVEAU_TALENT",
        titre: "🎉 Nouveau talent ajouté",
        message: `${talent.prenom} ${talent.nom} a été ajouté par ${manager.prenom}. Vérifiez les tarifs !`,
        lien: `/talents/${talent.id}`,
        talentId: talent.id,
      },
    })
  )
);
```

---

### 2. ❌ **CRÉATION DE MARQUE - Pas de notification**

**Problème :**
- Fichier : `/src/app/api/marques/route.ts` (ligne 52-89)
- Aucune notification n'est envoyée quand une marque est créée
- Les HEAD_OF et ADMIN ne sont pas informés

**Impact :**
- Manque de visibilité sur les nouvelles marques
- Pas de processus de validation

**Solution requise :**
```typescript
// Après création de la marque
await Promise.all([
  // Notifier les HEAD_OF
  ...headsOf.map(head =>
    prisma.notification.create({
      data: {
        userId: head.id,
        type: "NOUVELLE_MARQUE",
        titre: "🏢 Nouvelle marque ajoutée",
        message: `${marque.nom} a été ajoutée au système`,
        lien: `/marques/${marque.id}`,
        marqueId: marque.id,
      },
    })
  ),
]);
```

---

### 3. ❌ **CRÉATION DE COLLABORATION - Pas de notification**

**Problème :**
- Fichier : `/src/app/api/collaborations/route.ts` (ligne 46-73)
- Aucune notification lors de la création d'une collaboration
- Le TM crée une collab mais personne n'est notifié

**Impact :**
- Manque de traçabilité
- HEAD_OF pas informée des nouvelles collabs

**Solution requise :**
```typescript
// Après création de la collaboration
// Notifier la HEAD_OF
await prisma.notification.create({
  data: {
    userId: headOfId,
    type: "COLLAB_GAGNEE",
    titre: "🎉 Nouvelle collaboration créée",
    message: `${collaboration.talent.prenom} ${collaboration.talent.nom} × ${collaboration.marque.nom}`,
    lien: `/collaborations/${collaboration.id}`,
    collabId: collaboration.id,
  },
});
```

---

### 4. ⚠️ **VALIDATION DES TARIFS - Pas de workflow**

**Problème :**
- Les tarifs sont créés automatiquement lors de la création du talent
- Mais il n'y a pas de workflow de validation par la HEAD_OF
- Pas de champ `tarifsValidated` ou `tarifsValidatedBy` dans le schéma

**Impact :**
- Risque d'utiliser des tarifs incorrects
- Pas de traçabilité de qui a validé

**Solution requise :**
```prisma
model Talent {
  // ... champs existants
  
  tarifsValidated   Boolean   @default(false)
  tarifsValidatedBy String?
  tarifsValidatedAt DateTime?
  
  // ... relations existantes
}
```

Ajouter un endpoint :
```typescript
// POST /api/talents/[id]/valider-tarifs
// Réservé aux HEAD_OF
```

---

### 5. ⚠️ **CHANGEMENT DE STATUT COLLAB - Notifications manquantes**

**Problème :**
- Quand une collab passe de `NEGO` → `GAGNE` → `EN_COURS` → `PUBLIE`
- Aucune notification automatique n'est envoyée

**Impact :**
- Manque de visibilité sur l'avancement des collabs
- Équipe pas informée des changements

**Solution requise :**
```typescript
// Dans l'endpoint PUT /api/collaborations/[id]/route.ts
// Ajouter des notifications selon le changement de statut

if (oldStatut !== newStatut) {
  // Si passage à PUBLIE → Notifier le TALENT
  if (newStatut === "PUBLIE") {
    await prisma.notification.create({
      data: {
        userId: talent.userId,
        type: "COLLAB_PUBLIE",
        titre: "✅ Collaboration publiée !",
        message: `Votre collaboration ${ref} est publiée. Vous pouvez maintenant uploader votre facture.`,
        lien: `/collaborations/${id}`,
      },
    });
  }
  
  // Si passage à FACTURE_RECUE → Notifier TM et ADMIN
  if (newStatut === "FACTURE_RECUE") {
    // ...
  }
}
```

---

### 6. ❌ **SYSTÈME DE RELANCES - Inexistant**

**Problème :**
- Type de notification `FACTURE_RELANCE` existe dans l'enum
- Mais aucun système de relance automatique n'est implémenté
- Pas de cron job pour relancer les factures impayées

**Impact :**
- Retards de paiement non gérés
- Pas de suivi automatique

**Solution requise :**
```typescript
// Créer un cron job (Vercel Cron ou similaire)
// POST /api/cron/relances-factures
// Exécuté tous les jours à 9h

// Logique :
// 1. Trouver toutes les factures CLIENT avec dateLimite dépassée et statut !== PAYE
// 2. Calculer le nombre de jours de retard
// 3. Envoyer notification à l'ADMIN + email au client
```

---

### 7. ⚠️ **UPLOAD FACTURE TALENT - Workflow incomplet**

**Problème :**
- Upload facture fonctionne ✅
- Mais il manque le bouton "Marquer comme payé" dans l'interface ADMIN
- Pas d'endpoint pour marquer le talent comme payé

**Impact :**
- Impossible de fermer le cycle de paiement talent

**Solution requise :**
```typescript
// POST /api/collaborations/[id]/marquer-paye-talent
// Réservé ADMIN uniquement

// Actions :
// 1. Mettre à jour collaboration.paidAt = new Date()
// 2. Mettre à jour collaboration.statut = "PAYE"
// 3. Notifier le TALENT
```

---

### 8. ❌ **BILAN RETARD - Inexistant**

**Problème :**
- Type de notification `BILAN_RETARD` existe
- Mais aucun système de détection des retards n'est implémenté

**Impact :**
- Pas de suivi des collaborations en retard
- Pas d'alertes automatiques

**Solution requise :**
```typescript
// Cron job quotidien
// Détecter :
// 1. Négociations EN_ATTENTE depuis + de 7 jours
// 2. Collaborations EN_COURS avec dateDebut dépassée et pas de lienPublication
// 3. Factures impayées depuis + de X jours
```

---

### 9. ⚠️ **PERMISSIONS API - Incohérences**

**Problème :**
- Certains endpoints n'ont pas de vérification de session
- D'autres ont des permissions trop larges

**Exemples :**
```typescript
// ❌ /api/collaborations/route.ts GET (ligne 5)
// Pas de vérification de session !

// ✅ /api/talents/route.ts POST (ligne 68)
// Bien protégé : ADMIN, HEAD_OF uniquement
```

**Solution :**
Audit complet de tous les endpoints et ajout systématique de :
```typescript
const session = await getServerSession(authOptions);
if (!session?.user) {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}
```

---

### 10. ❌ **STATISTIQUES DASHBOARD - Incomplètes**

**Problème :**
- Le dashboard n'affiche pas :
  - Nombre de talents en attente de validation tarifs
  - Nombre de factures en retard
  - Montant total en attente de paiement
  - Taux de conversion négociation → collaboration

**Solution :**
Enrichir `/api/dashboard/route.ts` avec ces KPIs.

---

## 📊 RÉCAPITULATIF PAR GRAVITÉ

### 🔴 CRITIQUE (À CORRIGER IMMÉDIATEMENT)
1. ❌ Création talent → Pas de notification HEAD_OF
2. ❌ Création collaboration → Pas de notification
3. ❌ Permissions API manquantes (GET collaborations non protégé)

### 🟠 IMPORTANT (À CORRIGER RAPIDEMENT)
4. ⚠️ Validation tarifs → Pas de workflow
5. ⚠️ Upload facture talent → Workflow incomplet (bouton "Marquer payé" manquant)
6. ⚠️ Changement statut collab → Notifications manquantes

### 🟡 MOYEN (À PLANIFIER)
7. ❌ Système de relances → Inexistant
8. ❌ Bilan retard → Inexistant
9. ⚠️ Permissions API → Audit complet requis

### 🔵 AMÉLIORATION (Nice-to-have)
10. ❌ Dashboard KPIs → Incomplets

---

## ✅ CE QUI FONCTIONNE BIEN

1. ✅ **Négociations** : Flow complet avec brouillon, soumission, validation
2. ✅ **Notifications négociations** : HEAD_OF notifiée des modifications
3. ✅ **Upload facture talent** : Endpoint fonctionnel, notifications envoyées
4. ✅ **Dossiers complets** : Vue ADMIN avec tout l'historique
5. ✅ **Génération factures** : Système PDF fonctionnel
6. ✅ **Authentification** : NextAuth bien configuré
7. ✅ **Base de données** : Schéma Prisma bien structuré

---

## 🎯 PLAN D'ACTION RECOMMANDÉ

### Phase 1 : CRITIQUE (1-2 jours)
```
✅ 1. Ajouter notifications création talent
✅ 2. Ajouter notifications création collaboration
✅ 3. Protéger tous les endpoints GET
✅ 4. Ajouter endpoint "Marquer talent payé"
```

### Phase 2 : IMPORTANT (3-5 jours)
```
✅ 5. Implémenter workflow validation tarifs
✅ 6. Ajouter notifications changements statut collab
✅ 7. Créer interface "Marquer payé" dans UI ADMIN
```

### Phase 3 : MOYEN (1-2 semaines)
```
✅ 8. Système de relances automatiques (cron job)
✅ 9. Bilan retard quotidien
✅ 10. Audit complet permissions API
```

### Phase 4 : AMÉLIORATION (optionnel)
```
✅ 11. Dashboard KPIs avancés
✅ 12. Système d'alertes personnalisables
✅ 13. Export Excel / CSV des données
```

---

## 🔧 OUTILS NÉCESSAIRES

1. **Cron Jobs** : Vercel Cron ou similaire
2. **Email** : Resend, SendGrid ou similaire (pour relances)
3. **Monitoring** : Sentry ou similaire (pour tracker les erreurs)
4. **Analytics** : Mixpanel ou similaire (pour suivre l'usage)

---

## 📝 NOTES IMPORTANTES

- Le système de base est **solide** ✅
- La structure du code est **propre et maintenable** ✅
- Il manque principalement des **notifications** et de la **traçabilité** ⚠️
- Les permissions sont **globalement bonnes** mais nécessitent un **audit** 🔍

---

**Prochaine étape : Commencer par la Phase 1 (CRITIQUE) 🚀**
