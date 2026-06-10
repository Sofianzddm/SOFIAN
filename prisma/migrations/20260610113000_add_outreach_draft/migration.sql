-- Brouillon par client Outreach : permet de rédiger dans le composer
-- (identique au pipeline talent) et d'enregistrer avant envoi.

ALTER TABLE "outreach_targets"
  ADD COLUMN IF NOT EXISTS "draftSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "draftBodyHtml" TEXT;
