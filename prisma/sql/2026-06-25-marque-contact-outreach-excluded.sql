-- Neon : ajout du flag outreachExcluded sur marque_contacts.
-- Permet de retirer une marque de l'outreach sans supprimer ses contacts :
-- le contact reste dans le CRM mais ne réapparaît plus en « en attente d'email ».
ALTER TABLE "marque_contacts"
  ADD COLUMN IF NOT EXISTS "outreachExcluded" BOOLEAN NOT NULL DEFAULT FALSE;
