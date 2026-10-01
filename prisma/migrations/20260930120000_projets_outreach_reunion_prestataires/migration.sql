-- CreateEnum
CREATE TYPE "ProspectingPrestataireCategorie" AS ENUM ('HOTEL', 'TRAITEUR', 'PHOTO', 'BEAUTY', 'TRANSPORT', 'LIEU', 'AUTRE');

-- CreateEnum
CREATE TYPE "ProspectingPrestataireStatut" AS ENUM ('A_CONTACTER', 'EN_COURS', 'CONFIRME', 'ANNULE');

-- AlterTable
ALTER TABLE "talent_prospecting_campaigns" ADD COLUMN IF NOT EXISTS "necessitePrestataires" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "talent_prospecting_campaigns" ADD COLUMN IF NOT EXISTS "lieu" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "talent_prospecting_campaign_prestataires" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" "ProspectingPrestataireCategorie" NOT NULL DEFAULT 'AUTRE',
    "responsableId" TEXT,
    "responsableTalentId" TEXT,
    "statut" "ProspectingPrestataireStatut" NOT NULL DEFAULT 'A_CONTACTER',
    "notes" TEXT,
    "contactInfo" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_prospecting_campaign_prestataires_pkey" PRIMARY KEY ("id")
);
