-- Marché de prospection (FR / BENELUX) pour la Prospection Agences.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Ajoute un onglet marché (agences françaises vs agences belges / Benelux),
-- avec filtrage de la liste par marché et adaptation de la rédaction IA
-- (agence française qui développe le Benelux avec des créateurs benelux).

ALTER TABLE "agency_outreach_targets"
  ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT 'FR';

CREATE INDEX IF NOT EXISTS "agency_outreach_targets_market_status_idx"
  ON "agency_outreach_targets" ("market", "status");
