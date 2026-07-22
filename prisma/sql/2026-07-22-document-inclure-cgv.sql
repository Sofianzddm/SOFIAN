-- Option pour exclure les pages CGV d'un devis PDF.
-- Par défaut true : comportement historique (CGV toujours jointes).
-- Table réelle : documents (@@map sur le modèle Document)

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "inclureCgv" BOOLEAN NOT NULL DEFAULT true;
