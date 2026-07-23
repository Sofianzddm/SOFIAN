-- Enrichissement : recherche / complétion d'emails avant passage en outreach.
-- À appliquer sur Neon (idempotent).

ALTER TABLE "marque_contacts"
  ADD COLUMN IF NOT EXISTS "emailLookupStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "emailLookupQueuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailSuggested" TEXT;

CREATE INDEX IF NOT EXISTS "marque_contacts_emailLookupStatus_idx"
  ON "marque_contacts"("emailLookupStatus");
