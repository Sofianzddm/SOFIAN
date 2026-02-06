# 📦 Système de Gestion des Gifts - Guide Complet

## Vue d'ensemble

Le système de gestion des gifts permet aux **Talent Managers (TM)** de demander des produits ou services gratuits pour leurs talents auprès des marques. Les **Account Managers (CM)** prennent en charge ces demandes et gèrent tout le processus de suivi avec un workflow structuré.

## Rôles et Permissions

### Talent Manager (TM)
- ✅ Créer des demandes de gifts pour ses talents
- ✅ Voir toutes ses demandes
- ✅ Commenter et échanger avec l'Account Manager
- ✅ Modifier certaines informations de ses demandes
- ❌ Ne peut pas prendre en charge les demandes d'autres TM

### Account Manager (CM)
- ✅ Voir toutes les demandes de gifts
- ✅ Prendre en charge les demandes
- ✅ Gérer le workflow complet
- ✅ Contacter les marques
- ✅ Suivre l'envoi et la réception
- ✅ Ajouter des notes internes

### Admin & Head of
- ✅ Accès complet à toutes les fonctionnalités
- ✅ Peut agir comme TM ou AM

## Workflow Complet

### 1️⃣ **EN_ATTENTE** - Demande soumise
- Le TM crée une demande de gift pour un talent
- La demande est automatiquement en statut "EN_ATTENTE"
- Une notification est envoyée aux Account Managers

### 2️⃣ **EN_COURS** - Prise en charge
- Un Account Manager prend en charge la demande
- Il est automatiquement assigné comme responsable
- Date de prise en charge enregistrée

### 3️⃣ **ATTENTE_MARQUE** - Marque contactée
- L'AM contacte la marque pour demander le gift
- Date de contact enregistrée
- L'AM peut ajouter des notes sur les échanges

### 4️⃣ **ACCEPTE** ou **REFUSE** - Réponse de la marque
- **ACCEPTE** : La marque accepte d'envoyer le gift
- **REFUSE** : La marque refuse (fin du processus)
- Date de réponse enregistrée

### 5️⃣ **ENVOYE** - Gift expédié
- La marque a envoyé le gift
- L'AM peut ajouter un numéro de suivi
- Date d'envoi enregistrée

### 6️⃣ **RECU** - Gift réceptionné
- Le talent a reçu le gift
- Processus terminé avec succès
- Date de réception enregistrée

### ❌ **ANNULE** - Demande annulée
- Le TM ou un Admin peut annuler une demande
- Disponible à tout moment avant "RECU"

## Types de Gifts

- **PRODUIT** : Produits physiques (vêtements, cosmétiques, électronique, etc.)
- **EXPERIENCE** : Expériences (séjour hôtel, restaurant, événement, etc.)
- **SERVICE** : Services (shooting photo, coaching, consultation, etc.)
- **AUTRE** : Tout autre type de gift

## Niveaux de Priorité

- **BASSE** : Pas urgent, traitement standard
- **NORMALE** : Priorité normale (par défaut)
- **HAUTE** : Important, à traiter rapidement
- **URGENTE** : Très important, traitement prioritaire

## Interface Talent Manager

### Page Liste (`/gifts`)
- Vue d'ensemble de toutes ses demandes
- Filtres par statut
- Recherche par référence, talent ou description
- Stats en temps réel
- Bouton "Nouvelle demande"

### Formulaire de création (`/gifts/new`)
- Sélection du talent
- Type de gift
- Description détaillée
- Justification (optionnel mais recommandé)
- Marque souhaitée (optionnel)
- Valeur estimée
- Date de réception souhaitée
- Adresse de livraison (pré-remplie avec l'adresse du talent)

### Page détails (`/gifts/[id]`)
- Détails complets de la demande
- Système de commentaires pour échanger avec l'AM
- Timeline des événements
- Informations du talent et de la marque
- Statut en temps réel

## Interface Account Manager

### Page Liste (`/gifts`)
- Vue d'ensemble de **toutes** les demandes de l'agence
- Filtres avancés par statut
- Indicateur des demandes en attente de prise en charge
- Stats globales

### Page détails (`/gifts/[id]`)
**Panel Workflow** (exclusif AM):
- Vue visuelle du workflow complet
- 6 étapes cliquables
- Changement de statut en un clic
- Bouton "Prendre en charge" si pas encore assigné
- Validation automatique des dates

**Édition avancée**:
- Modification du statut
- Modification de la priorité
- Ajout de numéro de suivi
- Notes internes (non visibles par le TM)
- Modification des dates clés

**Système de commentaires**:
- Échange direct avec le TM
- Historique complet
- Notifications en temps réel

## Base de Données

### Table `demandes_gift`
```prisma
model DemandeGift {
  id                String        @id @default(cuid())
  reference         String        @unique // GIFT-2026-0001
  
  // Relations
  talentId          String
  talent            Talent        @relation(...)
  tmId              String
  tm                User          @relation("TMDemandeGift", ...)
  accountManagerId  String?
  accountManager    User?         @relation("AMDemandeGift", ...)
  marqueId          String?
  marque            Marque?       @relation(...)
  
  // Détails
  statut            StatutGift    @default(BROUILLON)
  priorite          String        @default("NORMALE")
  typeGift          String
  description       String        @db.Text
  justification     String?       @db.Text
  valeurEstimee     Decimal?
  
  // Dates de suivi
  datePriseEnCharge DateTime?
  dateContactMarque DateTime?
  dateReponseMarque DateTime?
  dateEnvoi         DateTime?
  dateReception     DateTime?
  
  // Relations
  commentaires      CommentaireGift[]
}
```

### Table `commentaires_gift`
```prisma
model CommentaireGift {
  id              String      @id @default(cuid())
  demandeGiftId   String
  demandeGift     DemandeGift @relation(...)
  auteurId        String
  auteur          User        @relation(...)
  contenu         String      @db.Text
  interne         Boolean     @default(false)
  createdAt       DateTime    @default(now())
}
```

## Routes API

### `GET /api/gifts`
Liste des demandes de gifts
- TM: uniquement ses demandes
- CM/Admin: toutes les demandes
- Params: `?statut=EN_COURS&talentId=xxx`

### `POST /api/gifts`
Créer une nouvelle demande
- Réservé aux TM
- Génération automatique de la référence
- Validation du talent géré par le TM

### `GET /api/gifts/[id]`
Détails d'une demande
- Inclut talent, TM, AM, marque, commentaires
- Vérification des droits d'accès

### `PATCH /api/gifts/[id]`
Modifier une demande
- TM: champs limités
- AM/Admin: tous les champs incluant statut et dates

### `DELETE /api/gifts/[id]`
Annuler une demande (change statut à ANNULE)
- TM créateur ou Admin uniquement

### `POST /api/gifts/[id]/commentaires`
Ajouter un commentaire
- TM et AM peuvent commenter
- Support des commentaires internes (AM uniquement)

### `POST /api/gifts/[id]/prendre-en-charge`
Prendre en charge une demande
- Réservé aux AM
- Assigne l'AM et change le statut à EN_COURS

## Migration

1. **Appliquer le schema Prisma**:
   ```bash
   npx prisma db push
   ```

2. **Ou exécuter le SQL manuel**:
   ```bash
   psql DATABASE_URL < MIGRATION_GIFTS.sql
   ```

3. **Générer le client Prisma**:
   ```bash
   npx prisma generate
   ```

## Notifications (À implémenter)

### Pour les Account Managers
- ⚡ Nouvelle demande de gift créée
- 💬 Nouveau commentaire du TM sur une demande en charge

### Pour les Talent Managers
- ✅ Demande prise en charge par un AM
- 📝 Changement de statut de la demande
- 💬 Nouveau commentaire de l'AM
- 📦 Gift envoyé
- ✨ Gift reçu

## Bonnes Pratiques

### Pour les TM
1. ✅ Toujours justifier la demande (pourquoi ce gift est important)
2. ✅ Indiquer la valeur estimée pour aider l'AM
3. ✅ Spécifier la marque si vous avez un contact
4. ✅ Vérifier l'adresse de livraison
5. ✅ Communiquer régulièrement avec l'AM via les commentaires

### Pour les AM
1. ✅ Prendre en charge rapidement les demandes urgentes
2. ✅ Tenir à jour les statuts
3. ✅ Ajouter des notes internes pour le suivi
4. ✅ Communiquer avec le TM à chaque étape importante
5. ✅ Ajouter le numéro de suivi dès l'envoi

## Statistiques Disponibles

- Total de demandes
- Demandes en attente de prise en charge
- Demandes en cours de traitement
- Demandes acceptées
- Demandes terminées (reçues)
- Taux de réussite par AM
- Temps moyen de traitement

## Améliorations Futures

- [ ] Système de notifications push
- [ ] Export Excel des demandes
- [ ] Dashboard analytique pour les AM
- [ ] Templates de messages pour les marques
- [ ] Historique des gifts par marque
- [ ] Intégration avec le système de facturation
- [ ] Rappels automatiques pour le suivi
- [ ] Évaluation de la qualité des gifts reçus

---

**Créé le**: 26 janvier 2026  
**Version**: 1.0  
**Status**: Production Ready ✅
