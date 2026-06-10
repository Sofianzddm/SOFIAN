-- Fichier de cartographie original (Excel/CSV importé), conservé tel quel
-- pour consultation/téléchargement depuis la fiche marque.
CREATE TABLE IF NOT EXISTS "marque_carto_files" (
  "id" TEXT NOT NULL,
  "marqueId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "marque_carto_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marque_carto_files_marqueId_idx"
  ON "marque_carto_files" ("marqueId");

ALTER TABLE "marque_carto_files"
  ADD CONSTRAINT "marque_carto_files_marqueId_fkey"
  FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
