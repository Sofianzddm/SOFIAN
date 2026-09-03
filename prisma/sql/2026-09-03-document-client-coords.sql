-- Coordonnées client propres à un devis/facture (override de la fiche marque).
-- Permet de corriger l'adresse / « à l'attention de » sur un document validé
-- sans toucher aux lignes ni à la marque partagée.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "clientCodePostal" TEXT,
  ADD COLUMN IF NOT EXISTS "clientVille" TEXT,
  ADD COLUMN IF NOT EXISTS "clientSiret" TEXT,
  ADD COLUMN IF NOT EXISTS "clientTva" TEXT,
  ADD COLUMN IF NOT EXISTS "clientAttention" TEXT;
