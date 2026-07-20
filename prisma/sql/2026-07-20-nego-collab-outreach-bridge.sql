-- Pont Négos / Collaborations → cycle outreach 45j.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Le contact marque d'une négociation terminée (refusée/annulée) ou devenue
-- collaboration entre automatiquement dans le cycle outreach 45j, rattaché à
-- la fiche marque, avec recontact = dernière activité du deal + 45 jours.
-- "outreachTargetRef" = "<pipeline>:<targetId>" ou "skipped:<raison>".

ALTER TABLE "negociations"
  ADD COLUMN IF NOT EXISTS "outreachBridgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "outreachTargetRef" TEXT;
