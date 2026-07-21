-- Attributs physiques du talent (peau / cheveux).
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Beaucoup de marques beauté / cosmétique / haircare demandent le type de peau,
-- le type et la couleur de cheveux pour matcher un talent à un produit. On les
-- stocke en champs structurés (valeurs canoniques FR, cf.
-- src/lib/talent-attributes.ts) pour pouvoir filtrer la roster par critère et
-- les afficher sur les books envoyés aux marques.

ALTER TABLE "talents"
  ADD COLUMN IF NOT EXISTS "typePeau" TEXT,
  ADD COLUMN IF NOT EXISTS "typeCheveux" TEXT,
  ADD COLUMN IF NOT EXISTS "couleurCheveux" TEXT;
