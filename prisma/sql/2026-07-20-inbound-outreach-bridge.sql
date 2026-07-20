-- Pont Inbound → Outreach 45j.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Colonnes de pont sur les flux entrants : quand un échange inbound /
-- demande entrante est clôturé (réponse reçue ou séquence de relances
-- terminée), le contact est ajouté automatiquement au cycle outreach 45j
-- (client, agence ou benelux selon routage) et on trace ici quand / où.
-- "outreachTargetRef" = "<pipeline>:<targetId>" ou "skipped:<raison>".

ALTER TABLE "inbound_opportunities"
  ADD COLUMN IF NOT EXISTS "outreachBridgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "outreachTargetRef" TEXT;

ALTER TABLE "DemandeEntrante"
  ADD COLUMN IF NOT EXISTS "outreachBridgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "outreachTargetRef" TEXT;
