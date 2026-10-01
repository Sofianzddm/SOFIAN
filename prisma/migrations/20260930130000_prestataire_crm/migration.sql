-- CRM Prestataires + lien depuis les lignes projet
CREATE TABLE IF NOT EXISTS "prestataires" (
  "id" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "categorie" "ProspectingPrestataireCategorie" NOT NULL DEFAULT 'AUTRE',
  "siteWeb" TEXT,
  "email" TEXT,
  "telephone" TEXT,
  "instagram" TEXT,
  "adresse" TEXT,
  "ville" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prestataires_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "prestataire_contacts" (
  "id" TEXT NOT NULL,
  "prestataireId" TEXT NOT NULL,
  "prenom" TEXT,
  "nom" TEXT,
  "email" TEXT,
  "telephone" TEXT,
  "role" TEXT,
  "notes" TEXT,
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prestataire_contacts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "talent_prospecting_campaign_prestataires"
  ADD COLUMN IF NOT EXISTS "prestataireCrmId" TEXT;
