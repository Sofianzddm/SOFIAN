-- SOLO projets outreach : marque déjà contactée → ajout OK mais en attente jusqu'à brandCooldownUntil
ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "brandCooldownUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "brandCooldownReason" TEXT;

CREATE INDEX IF NOT EXISTS "contact_missions_brandCooldownUntil_idx"
  ON "contact_missions"("brandCooldownUntil");
