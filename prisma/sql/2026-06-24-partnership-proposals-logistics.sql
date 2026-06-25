-- Ajoute la section logement & logistique (liens) aux propositions.
-- À appliquer sur Neon (ou via `npx prisma db push`).

ALTER TABLE "partnership_proposals"
  ADD COLUMN IF NOT EXISTS "logistics" JSONB NOT NULL DEFAULT '[]';
