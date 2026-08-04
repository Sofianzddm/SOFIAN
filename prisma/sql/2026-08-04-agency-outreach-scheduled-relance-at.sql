-- Neon : date de relance choisie à la programmation d'un envoi (appliquée au touch à l'envoi réel).
-- Null = relance auto J+3. Idempotent.
ALTER TABLE "agency_outreach_targets" ADD COLUMN IF NOT EXISTS "scheduledRelanceAt" TIMESTAMP(3);
