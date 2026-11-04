-- Mise en attente manuelle Pipeline Casting (pas de casting ouvert avant une date).
ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "recontactHoldUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recontactHoldNote" TEXT,
  ADD COLUMN IF NOT EXISTS "recontactHoldById" TEXT;

CREATE INDEX IF NOT EXISTS "contact_missions_recontactHoldUntil_idx"
  ON "contact_missions"("recontactHoldUntil");
