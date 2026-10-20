-- Envoi programmé / étalé anti-spam pour la Prospection BENELUX
-- (même modèle que outreach FR : scheduledSendAt + cron).

ALTER TABLE "benelux_outreach_targets"
  ADD COLUMN IF NOT EXISTS "scheduledSendAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledBodyHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledById" TEXT;

CREATE INDEX IF NOT EXISTS "benelux_outreach_targets_scheduledSendAt_idx"
  ON "benelux_outreach_targets" ("scheduledSendAt");
