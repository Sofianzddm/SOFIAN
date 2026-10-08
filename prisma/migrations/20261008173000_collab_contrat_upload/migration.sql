-- Upload PDF libre pour le contrat collab (signature DocuSeal multi-signataires),
-- même pipeline que les contrats talent (fiche talent).

ALTER TABLE "collaborations"
  ADD COLUMN IF NOT EXISTS "contratDocusealTemplateId" INTEGER,
  ADD COLUMN IF NOT EXISTS "contratFichierUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "contratTitre" TEXT,
  ADD COLUMN IF NOT EXISTS "contratSignataires" JSONB;
