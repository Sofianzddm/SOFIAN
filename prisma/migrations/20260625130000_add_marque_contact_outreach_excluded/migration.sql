-- Retire une marque de l'outreach sans supprimer ses contacts du CRM.
-- Quand `outreachExcluded` = true, le contact CARTO reste sur la fiche marque
-- mais ne réapparaît plus dans la liste « en attente d'email » de /outreach.

ALTER TABLE "marque_contacts"
  ADD COLUMN IF NOT EXISTS "outreachExcluded" BOOLEAN NOT NULL DEFAULT FALSE;
