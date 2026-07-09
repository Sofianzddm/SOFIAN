-- Relance 2 automatique (J+10 ouvrés après la relance J+3) sur le pipeline
-- prospection projet individuel talent.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).

ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "relance2SentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relance2MessageIds" JSONB,
  ADD COLUMN IF NOT EXISTS "relance2Error" TEXT;
