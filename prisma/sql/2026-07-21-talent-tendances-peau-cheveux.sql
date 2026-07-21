-- Tendances / préoccupations peau & cheveux du talent (sélection multiple).
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Complète les attributs physiques (typePeau/typeCheveux/couleurCheveux) avec des
-- tendances cumulables (ex. peau acnéique + sensible, cheveux gras aux racines +
-- pointes sèches). Stockées en tableaux de texte (valeurs canoniques FR, cf.
-- src/lib/talent-attributes.ts) pour filtrer la roster et afficher sur les books.

ALTER TABLE "talents"
  ADD COLUMN IF NOT EXISTS "tendancePeau" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "tendanceCheveux" TEXT[] NOT NULL DEFAULT '{}';
