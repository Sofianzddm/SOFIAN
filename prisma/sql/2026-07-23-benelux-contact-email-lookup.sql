-- Enrichissement BENELUX : file emails manquants (idempotent).

ALTER TABLE "benelux_contacts"
  ADD COLUMN IF NOT EXISTS "emailLookupStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "emailLookupQueuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailSuggested" TEXT;

CREATE INDEX IF NOT EXISTS "benelux_contacts_emailLookupStatus_idx"
  ON "benelux_contacts"("emailLookupStatus");
