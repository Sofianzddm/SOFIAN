-- Notes + journal d'appels par contact marque (CRM)
DO $$ BEGIN
  CREATE TYPE "MarqueContactActivityType" AS ENUM ('NOTE', 'CALL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "marque_contact_activities" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "MarqueContactActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "callOutcome" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marque_contact_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marque_contact_activities_contactId_occurredAt_idx"
  ON "marque_contact_activities"("contactId", "occurredAt");
CREATE INDEX IF NOT EXISTS "marque_contact_activities_contactId_createdAt_idx"
  ON "marque_contact_activities"("contactId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "marque_contact_activities"
        ADD CONSTRAINT "marque_contact_activities_contactId_fkey"
        FOREIGN KEY ("contactId") REFERENCES "marque_contacts"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
