-- Envoi décalé (staggered) pour la Prospection Agences.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Ajoute la possibilité d'étaler l'envoi groupé dans la journée (jusqu'à 18h30)
-- au lieu de tout envoyer d'un coup. Le cron /api/cron/agency-outreach envoie
-- chaque mail quand "scheduledSendAt" est atteint puis remet les champs à null.

ALTER TABLE "agency_outreach_targets"
  ADD COLUMN IF NOT EXISTS "scheduledSendAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledBodyHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledById" TEXT;

CREATE INDEX IF NOT EXISTS "agency_outreach_targets_scheduledSendAt_idx"
  ON "agency_outreach_targets" ("scheduledSendAt");
