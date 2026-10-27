-- Snapshot analyses casting (marque / talent / Leyna) pour réouvrir le composer
-- après rédaction serveur (même si le navigateur a été fermé).

ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "castingResearchSnapshot" JSONB;

ALTER TABLE "outreach_targets"
  ADD COLUMN IF NOT EXISTS "castingResearchSnapshot" JSONB;

ALTER TABLE "benelux_outreach_targets"
  ADD COLUMN IF NOT EXISTS "castingResearchSnapshot" JSONB;

-- Cibles outreach sur chaque marque du job fit → enchaîne rédaction sans navigateur.
ALTER TABLE "casting_roster_fit_brands"
  ADD COLUMN IF NOT EXISTS "targetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "casting_roster_fit_brands"
  ADD COLUMN IF NOT EXISTS "pipeline" TEXT;
