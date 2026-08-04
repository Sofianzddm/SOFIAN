-- Neon : override manuel de la date de relance auto J+3 (prospection agences).
-- Null = échéance calculée (sentAt + 3j ouvrés + jitter). Idempotent.
ALTER TABLE "agency_outreach_touches" ADD COLUMN IF NOT EXISTS "relanceScheduledAt" TIMESTAMP(3);
