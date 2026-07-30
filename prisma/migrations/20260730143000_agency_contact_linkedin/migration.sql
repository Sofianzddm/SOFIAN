-- LinkedIn sur les contacts d'agence (file enrichissement, comme les marques).

ALTER TABLE "agency_contacts"
  ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
