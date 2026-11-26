-- Contacts prospection Cannes Partenaires (hors marque_contacts / CRM Marques)
-- Distinct de "CannesContact" (carnet événements villa Cannes 2026).
CREATE TABLE IF NOT EXISTS "cannes_partenaires_contacts" (
    "id" TEXT NOT NULL,
    "opportuniteId" TEXT NOT NULL,
    "prenom" TEXT,
    "nom" TEXT NOT NULL,
    "email" TEXT,
    "poste" TEXT,
    "perimetre" TEXT,
    "localisation" TEXT,
    "priorite" TEXT,
    "linkedinUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "emailLookupStatus" TEXT,
    "emailSuggested" TEXT,
    "emailLookupQueuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cannes_partenaires_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cannes_partenaires_contacts_opportuniteId_idx"
  ON "cannes_partenaires_contacts"("opportuniteId");
CREATE INDEX IF NOT EXISTS "cannes_partenaires_contacts_opportuniteId_email_idx"
  ON "cannes_partenaires_contacts"("opportuniteId", "email");
CREATE INDEX IF NOT EXISTS "cannes_partenaires_contacts_emailLookupStatus_idx"
  ON "cannes_partenaires_contacts"("emailLookupStatus");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_partenaires_contacts_opportuniteId_fkey'
  ) THEN
    ALTER TABLE "cannes_partenaires_contacts"
      ADD CONSTRAINT "cannes_partenaires_contacts_opportuniteId_fkey"
      FOREIGN KEY ("opportuniteId") REFERENCES "OpportuniteMarque"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
