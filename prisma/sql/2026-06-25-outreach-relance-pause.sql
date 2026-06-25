-- Neon : pause manuelle de la relance auto J+3 sur un mail de cycle Outreach.
-- `relanceCancelledAt` non nul = le cron saute la relance auto pour ce touch
-- (le compteur 45 jours du client continue normalement). Idempotent.
ALTER TABLE "outreach_touches" ADD COLUMN IF NOT EXISTS "relanceCancelledAt" TIMESTAMP(3);
ALTER TABLE "outreach_touches" ADD COLUMN IF NOT EXISTS "relanceCancelledById" TEXT;
