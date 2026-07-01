-- Envoi programmé (« à une heure précise », heure de Paris) pour la Prospection
-- clients/marques. Le mail groupé n'est pas envoyé immédiatement mais figé avec
-- son échéance ; le cron l'envoie quand scheduledSendAt est atteint.

ALTER TABLE "outreach_targets"
  ADD COLUMN IF NOT EXISTS "scheduledSendAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledBodyHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledById" TEXT;

CREATE INDEX IF NOT EXISTS "outreach_targets_scheduledSendAt_idx"
  ON "outreach_targets" ("scheduledSendAt");
