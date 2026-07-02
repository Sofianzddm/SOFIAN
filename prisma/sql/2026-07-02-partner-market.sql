-- Marché de l'agence partenaire (FR / BENELUX).
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Permet de désigner, au niveau de l'agence (model Partner), si c'est une
-- agence française (FR) ou belge / Benelux (BENELUX). Modifiable depuis la
-- page d'édition du partenaire, et propagé aux cibles de Prospection Agences.

ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT 'FR';

CREATE INDEX IF NOT EXISTS "partners_market_idx"
  ON "partners" ("market");
