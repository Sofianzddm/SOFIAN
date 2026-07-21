-- Profil / lifestyle du talent (animaux, enfants, sports, mobilité).
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Données fréquemment demandées par les marques pour le matching et le gifting
-- (petfood, famille/bébé, sport/wellness, events & voyages). Valeurs canoniques
-- FR, cf. src/lib/talent-attributes.ts. Stockées en tableaux (multi-sélection),
-- + nombre d'enfants (entier) et statut grossesse (booléen).

ALTER TABLE "talents"
  ADD COLUMN IF NOT EXISTS "animaux" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "nombreEnfants" INTEGER,
  ADD COLUMN IF NOT EXISTS "agesEnfants" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "enceinte" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sports" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "mobilite" TEXT[] NOT NULL DEFAULT '{}';
