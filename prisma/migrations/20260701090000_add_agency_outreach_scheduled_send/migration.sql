-- Envoi décalé (staggered) pour la Prospection Agences : le mail groupé peut
-- être étalé dans la journée (jusqu'à 18h30) au lieu de partir d'un coup. Le
-- cron envoie chaque mail quand "scheduledSendAt" est atteint.

ALTER TABLE "agency_outreach_targets"
  ADD COLUMN IF NOT EXISTS "scheduledSendAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledBodyHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledById" TEXT;

CREATE INDEX IF NOT EXISTS "agency_outreach_targets_scheduledSendAt_idx"
  ON "agency_outreach_targets" ("scheduledSendAt");
