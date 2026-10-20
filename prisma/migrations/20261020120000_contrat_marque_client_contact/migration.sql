-- Contact client confirmé à l'upload du contrat marque (échange direct juriste).
ALTER TABLE "collaborations" ADD COLUMN IF NOT EXISTS "contratMarqueContactNom" TEXT;
ALTER TABLE "collaborations" ADD COLUMN IF NOT EXISTS "contratMarqueContactEmail" TEXT;
ALTER TABLE "collaborations" ADD COLUMN IF NOT EXISTS "contratMarqueContactTelephone" TEXT;
