-- Enrichissement emails pour les contacts d'agences partenaires
-- (file /enrichissement onglet Agences → agency-outreach).

ALTER TABLE "agency_contacts" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "agency_contacts"
  ADD COLUMN IF NOT EXISTS "emailLookupStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "emailLookupQueuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailSuggested" TEXT;

CREATE INDEX IF NOT EXISTS "agency_contacts_emailLookupStatus_idx"
  ON "agency_contacts" ("emailLookupStatus");
