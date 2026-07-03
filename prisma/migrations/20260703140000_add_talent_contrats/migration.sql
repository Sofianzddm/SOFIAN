-- Contrats talent en signature électronique DocuSeal depuis la fiche talent.
-- L'agence glisse un PDF, place les champs dans le builder DocuSeal embarqué,
-- puis envoie au talent (email Resend « Votre contrat Glow Up »).

CREATE TABLE IF NOT EXISTS "talent_contrats" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "fichierUrl" TEXT NOT NULL,
    "docusealTemplateId" INTEGER NOT NULL,
    "submissionId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "avecSignatureAgence" BOOLEAN NOT NULL DEFAULT true,
    "signedDocumentUrl" TEXT,
    "envoyeAt" TIMESTAMP(3),
    "talentSigneAt" TIMESTAMP(3),
    "signeAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_contrats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "talent_contrats_talentId_idx" ON "talent_contrats" ("talentId");
CREATE INDEX IF NOT EXISTS "talent_contrats_submissionId_idx" ON "talent_contrats" ("submissionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'talent_contrats_talentId_fkey'
  ) THEN
    ALTER TABLE "talent_contrats"
      ADD CONSTRAINT "talent_contrats_talentId_fkey"
      FOREIGN KEY ("talentId") REFERENCES "talents" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'talent_contrats_createdById_fkey'
  ) THEN
    ALTER TABLE "talent_contrats"
      ADD CONSTRAINT "talent_contrats_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
