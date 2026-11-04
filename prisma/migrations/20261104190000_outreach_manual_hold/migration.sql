-- Mise en attente manuelle Outreach (la marque revient dans sa file à la date).
ALTER TABLE "outreach_targets"
  ADD COLUMN IF NOT EXISTS "manualHoldUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manualHoldNote" TEXT;

ALTER TABLE "benelux_outreach_targets"
  ADD COLUMN IF NOT EXISTS "manualHoldUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manualHoldNote" TEXT;
