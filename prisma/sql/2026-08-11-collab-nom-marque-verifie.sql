-- Rattrapage obligatoire du nom de marque (TM / HoS) :
-- null = pas encore resaisi/confirmé → CRM verrouillé.
ALTER TABLE "collaborations"
  ADD COLUMN IF NOT EXISTS "nomMarqueVerifieAt" TIMESTAMP(3);
