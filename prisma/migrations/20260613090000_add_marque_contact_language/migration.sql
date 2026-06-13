-- Langue du contact marque ("fr" | "en") : reprise par le cycle Outreach
-- (relance auto, génération de mails) quand le contact y est ajouté.

ALTER TABLE "marque_contacts"
  ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
