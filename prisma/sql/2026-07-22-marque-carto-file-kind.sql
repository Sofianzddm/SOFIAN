-- Distingue les fichiers carto d'origine (influence) des feuilles AO extraites.
-- À appliquer sur Neon (idempotent).

ALTER TABLE "marque_carto_files"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'CARTO';

CREATE INDEX IF NOT EXISTS "marque_carto_files_marqueId_kind_idx"
  ON "marque_carto_files"("marqueId", "kind");
