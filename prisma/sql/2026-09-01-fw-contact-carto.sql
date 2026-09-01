-- Colonnes cartographie sur les contacts Fashion Week.
-- L’unicité (clientId, email) saute : plusieurs contacts sans mail, et merge à l’import.
-- L’index unique a été créé en CREATE UNIQUE INDEX (pas une CONSTRAINT) :
-- DROP CONSTRAINT seul ne le retire pas → 1 seul contact sans mail par maison.

DROP INDEX IF EXISTS "fw_contacts_clientId_email_key";
ALTER TABLE "fw_contacts" DROP CONSTRAINT IF EXISTS "fw_contacts_clientId_email_key";

ALTER TABLE "fw_contacts" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "fw_contacts" ALTER COLUMN "email" DROP DEFAULT;

UPDATE "fw_contacts" SET "email" = NULL WHERE "email" IS NOT NULL AND BTRIM("email") = '';

ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "perimetre" TEXT;
ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "localisation" TEXT;
ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "marquesGerees" TEXT;
ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "marche" TEXT;
ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "emailLookupStatus" TEXT;
ALTER TABLE "fw_contacts" ADD COLUMN IF NOT EXISTS "emailLookupQueuedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "fw_contacts_clientId_email_idx" ON "fw_contacts"("clientId", "email");
CREATE INDEX IF NOT EXISTS "fw_contacts_emailLookupStatus_idx" ON "fw_contacts"("emailLookupStatus");

CREATE TABLE IF NOT EXISTS "fw_carto_files" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fw_carto_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fw_carto_files_clientId_idx" ON "fw_carto_files"("clientId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fw_carto_files_clientId_fkey'
  ) THEN
    ALTER TABLE "fw_carto_files"
      ADD CONSTRAINT "fw_carto_files_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "fw_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
