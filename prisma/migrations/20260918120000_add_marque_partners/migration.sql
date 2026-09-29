-- Lien CRM marque ↔ agence (Partner). Pas d'enrôlement outreach clients.
CREATE TABLE IF NOT EXISTS "marque_partners" (
  "id" TEXT NOT NULL,
  "marqueId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'INBOUND',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marque_partners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marque_partners_marqueId_partnerId_key"
  ON "marque_partners" ("marqueId", "partnerId");

CREATE INDEX IF NOT EXISTS "marque_partners_marqueId_idx"
  ON "marque_partners" ("marqueId");

CREATE INDEX IF NOT EXISTS "marque_partners_partnerId_idx"
  ON "marque_partners" ("partnerId");

DO $$ BEGIN
  ALTER TABLE "marque_partners"
    ADD CONSTRAINT "marque_partners_marqueId_fkey"
    FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marque_partners"
    ADD CONSTRAINT "marque_partners_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
