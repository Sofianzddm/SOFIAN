-- Marché de prospection pour la Prospection Agences : "FR" (agences françaises)
-- ou "BENELUX" (agences belges / Pays-Bas / Luxembourg). Sert au filtrage par
-- onglet marché et à adapter la rédaction IA.

ALTER TABLE "agency_outreach_targets"
  ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT 'FR';

CREATE INDEX IF NOT EXISTS "agency_outreach_targets_market_status_idx"
  ON "agency_outreach_targets" ("market", "status");
