-- Contexte ops libre (wizard casting) avant rédaction
ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "draftContext" TEXT;
