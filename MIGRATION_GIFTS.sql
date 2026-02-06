-- ============================================
-- MIGRATION: Système de gestion des Gifts
-- Date: 2026-01-26
-- Description: Ajout des demandes de gifts pour les talents
-- ============================================

-- Créer l'enum pour les statuts de gift
CREATE TYPE "StatutGift" AS ENUM (
  'BROUILLON',
  'EN_ATTENTE',
  'EN_COURS',
  'ATTENTE_MARQUE',
  'ACCEPTE',
  'REFUSE',
  'ENVOYE',
  'RECU',
  'ANNULE'
);

-- Table des demandes de gifts
CREATE TABLE "demandes_gift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reference" TEXT NOT NULL UNIQUE,
  
  -- Relations
  "talentId" TEXT NOT NULL,
  "tmId" TEXT NOT NULL,
  "accountManagerId" TEXT,
  "marqueId" TEXT,
  
  -- Détails de la demande
  "statut" "StatutGift" NOT NULL DEFAULT 'BROUILLON',
  "priorite" TEXT NOT NULL DEFAULT 'NORMALE',
  "typeGift" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "justification" TEXT,
  "valeurEstimee" DECIMAL(10, 2),
  
  -- Informations supplémentaires
  "datesouhaitee" TIMESTAMP(3),
  "adresseLivraison" TEXT,
  "notesInternes" TEXT,
  
  -- Suivi
  "datePriseEnCharge" TIMESTAMP(3),
  "dateContactMarque" TIMESTAMP(3),
  "dateReponseMarque" TIMESTAMP(3),
  "dateEnvoi" TIMESTAMP(3),
  "dateReception" TIMESTAMP(3),
  "numeroSuivi" TEXT,
  
  -- Timestamps
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  
  -- Foreign keys
  CONSTRAINT "demandes_gift_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "demandes_gift_tmId_fkey" FOREIGN KEY ("tmId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "demandes_gift_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "demandes_gift_marqueId_fkey" FOREIGN KEY ("marqueId") REFERENCES "marques"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Table des commentaires sur les demandes de gifts
CREATE TABLE "commentaires_gift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "demandeGiftId" TEXT NOT NULL,
  "auteurId" TEXT NOT NULL,
  "contenu" TEXT NOT NULL,
  "interne" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  
  -- Foreign keys
  CONSTRAINT "commentaires_gift_demandeGiftId_fkey" FOREIGN KEY ("demandeGiftId") REFERENCES "demandes_gift"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commentaires_gift_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Indexes pour améliorer les performances
CREATE INDEX "demandes_gift_talentId_idx" ON "demandes_gift"("talentId");
CREATE INDEX "demandes_gift_tmId_idx" ON "demandes_gift"("tmId");
CREATE INDEX "demandes_gift_accountManagerId_idx" ON "demandes_gift"("accountManagerId");
CREATE INDEX "demandes_gift_marqueId_idx" ON "demandes_gift"("marqueId");
CREATE INDEX "demandes_gift_statut_idx" ON "demandes_gift"("statut");
CREATE INDEX "demandes_gift_priorite_idx" ON "demandes_gift"("priorite");
CREATE INDEX "demandes_gift_createdAt_idx" ON "demandes_gift"("createdAt");

CREATE INDEX "commentaires_gift_demandeGiftId_idx" ON "commentaires_gift"("demandeGiftId");
CREATE INDEX "commentaires_gift_auteurId_idx" ON "commentaires_gift"("auteurId");
CREATE INDEX "commentaires_gift_createdAt_idx" ON "commentaires_gift"("createdAt");

-- ============================================
-- INSTRUCTIONS D'APPLICATION
-- ============================================
-- 1. Sauvegarder la base de données
-- 2. Exécuter ce script SQL sur la base de données
-- 3. Exécuter: npx prisma generate
-- 4. Redémarrer le serveur de développement
-- ============================================
