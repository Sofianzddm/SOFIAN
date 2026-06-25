-- Ajoute les groupes de casting (plusieurs propositions de line-up) aux propositions.
-- À appliquer sur Neon (ou via `npx prisma db push`).

ALTER TABLE "partnership_proposals"
  ADD COLUMN IF NOT EXISTS "castingGroups" JSONB NOT NULL DEFAULT '[]';
