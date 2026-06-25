-- Ajoute le thème d'apparence personnalisable aux propositions de partenariat.
-- À appliquer sur Neon (ou via `npx prisma db push`).

ALTER TABLE "partnership_proposals"
  ADD COLUMN IF NOT EXISTS "theme" JSONB;
