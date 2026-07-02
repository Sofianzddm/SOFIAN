-- Analyse IA des justificatifs de dépenses.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Stocke le résultat de l'analyse Claude du justificatif (fournisseur,
-- montants, date, catégorie suggérée) pour le pré-remplissage automatique
-- et le contrôle de cohérence avec la transaction bancaire.

ALTER TABLE "depenses"
  ADD COLUMN IF NOT EXISTS "analyseIA" JSONB;
