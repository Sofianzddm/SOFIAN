-- Base Fashion Week isolée du CRM (Inès = nom + date défilé, ADMIN = emails).
-- Projet strategy `fashion-week` : envoi depuis ines@glowupagence.fr.

CREATE TABLE IF NOT EXISTS "fw_clients" (
  "id" TEXT PRIMARY KEY,
  "nom" TEXT NOT NULL,
  "dateDefile" TIMESTAMP(3),
  "notes" TEXT,
  "statut" TEXT NOT NULL DEFAULT 'ATTENTE_EMAILS',
  "lastEmailSentAt" TIMESTAMP(3),
  "lastEmailFrom" TEXT,
  "lastEmailThreadId" TEXT,
  "emailSubject" TEXT,
  "emailOpenedAt" TIMESTAMP(3),
  "emailOpenCount" INTEGER NOT NULL DEFAULT 0,
  "emailRepliedAt" TIMESTAMP(3),
  "relanceSentAt" TIMESTAMP(3),
  "relanceError" TEXT,
  "emailThreads" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "fw_clients_statut_idx" ON "fw_clients"("statut");
CREATE INDEX IF NOT EXISTS "fw_clients_dateDefile_idx" ON "fw_clients"("dateDefile");

CREATE TABLE IF NOT EXISTS "fw_contacts" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL REFERENCES "fw_clients"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "role" TEXT,
  "addedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "fw_contacts_clientId_email_key"
  ON "fw_contacts"("clientId", "email");
CREATE INDEX IF NOT EXISTS "fw_contacts_clientId_idx" ON "fw_contacts"("clientId");

INSERT INTO "ProjetEvenement" (
  "id", "nom", "slug", "dateDebut", "dateFin", "statut", "senderEmail", "createdAt"
)
SELECT
  'fw-projet-fashion-week',
  'Fashion Week',
  'fashion-week',
  '2026-09-28T00:00:00.000Z'::timestamp,
  '2026-10-06T23:59:59.999Z'::timestamp,
  'ACTIF',
  'ines@glowupagence.fr',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "ProjetEvenement" WHERE slug = 'fashion-week'
);

UPDATE "ProjetEvenement"
SET "senderEmail" = 'ines@glowupagence.fr'
WHERE slug = 'fashion-week' AND "senderEmail" IS NULL;
