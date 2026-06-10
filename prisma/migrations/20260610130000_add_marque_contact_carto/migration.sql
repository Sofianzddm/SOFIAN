-- Cartographie de contacts importée (fichier Claude/Excel) sur les contacts marque
ALTER TABLE "marque_contacts" ADD COLUMN IF NOT EXISTS "priorite" TEXT;
ALTER TABLE "marque_contacts" ADD COLUMN IF NOT EXISTS "perimetre" TEXT;
ALTER TABLE "marque_contacts" ADD COLUMN IF NOT EXISTS "localisation" TEXT;
ALTER TABLE "marque_contacts" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
ALTER TABLE "marque_contacts" ADD COLUMN IF NOT EXISTS "source" TEXT;
