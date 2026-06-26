-- Ajoute les groupes de budget (plusieurs scénarios d'investissement) aux propositions.
-- À appliquer sur Neon (ou via `npx prisma db push`).

ALTER TABLE "partnership_proposals"
  ADD COLUMN IF NOT EXISTS "budgetGroups" JSONB NOT NULL DEFAULT '[]';
