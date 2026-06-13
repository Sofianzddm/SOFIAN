-- Langue du client Outreach ("fr" | "en") : la relance auto J+3 et la
-- génération de mails s'adaptent à la langue du contact.

ALTER TABLE "outreach_targets"
  ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
