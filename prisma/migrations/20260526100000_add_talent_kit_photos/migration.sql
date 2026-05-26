-- Ajout du champ kitPhotos sur les talents
-- Tableau (jusqu'à 10 slots) de photos additionnelles utilisées par le Kit Media public (/kit/[slug]).
ALTER TABLE "Talent"
ADD COLUMN "kitPhotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
