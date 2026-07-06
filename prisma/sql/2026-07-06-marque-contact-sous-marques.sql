-- Liaison plusieurs-à-plusieurs : un contact peut couvrir plusieurs sous-marques.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Le contact reste rattaché à sa marque (souvent la mère) via marqueId, mais on
-- lui associe ici une ou plusieurs marques filles qu'il couvre (ex. un contact
-- Unilever présent sur Home Care ET Personal Care).

CREATE TABLE IF NOT EXISTS "marque_contact_sous_marques" (
  "id"        TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "marqueId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marque_contact_sous_marques_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marque_contact_sous_marques_contactId_marqueId_key"
  ON "marque_contact_sous_marques" ("contactId", "marqueId");

CREATE INDEX IF NOT EXISTS "marque_contact_sous_marques_marqueId_idx"
  ON "marque_contact_sous_marques" ("marqueId");

DO $$ BEGIN
  ALTER TABLE "marque_contact_sous_marques"
    ADD CONSTRAINT "marque_contact_sous_marques_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "marque_contacts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marque_contact_sous_marques"
    ADD CONSTRAINT "marque_contact_sous_marques_marqueId_fkey"
    FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
