-- Ajoute les coefficients de calcul EMV (Earned Media Value) aux propositions.
-- À appliquer sur Neon (ou via `npx prisma db push`).

ALTER TABLE "partnership_proposals"
  ADD COLUMN IF NOT EXISTS "emvConfig" JSONB;
