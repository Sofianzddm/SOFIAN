-- Cartographie CSV/Excel sur fiche prestataire
ALTER TABLE "prestataire_contacts"
  ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "localisation" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'MANUAL';

CREATE TABLE IF NOT EXISTS "prestataire_carto_files" (
  "id" TEXT NOT NULL,
  "prestataireId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'CARTO',
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prestataire_carto_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "prestataire_carto_files_prestataireId_idx"
  ON "prestataire_carto_files"("prestataireId");

CREATE INDEX IF NOT EXISTS "prestataire_contacts_prestataireId_email_idx"
  ON "prestataire_contacts"("prestataireId", "email");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prestataire_carto_files_prestataireId_fkey'
  ) THEN
    ALTER TABLE "prestataire_carto_files"
      ADD CONSTRAINT "prestataire_carto_files_prestataireId_fkey"
      FOREIGN KEY ("prestataireId") REFERENCES "prestataires"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
