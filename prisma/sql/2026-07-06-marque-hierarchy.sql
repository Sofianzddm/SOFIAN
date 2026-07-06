-- Hiérarchie marques mères / marques filles (ex. Unilever → Dove, Axe…).
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Ajoute une auto-référence sur "marques" : chaque marque peut avoir une
-- marque mère (parentMarqueId) et donc des marques filles. onDelete SET NULL :
-- supprimer la mère ne supprime pas les filles, elles sont juste détachées.

ALTER TABLE "marques"
  ADD COLUMN IF NOT EXISTS "parentMarqueId" TEXT;

DO $$ BEGIN
  ALTER TABLE "marques"
    ADD CONSTRAINT "marques_parentMarqueId_fkey"
    FOREIGN KEY ("parentMarqueId") REFERENCES "marques"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "marques_parentMarqueId_idx"
  ON "marques" ("parentMarqueId");
