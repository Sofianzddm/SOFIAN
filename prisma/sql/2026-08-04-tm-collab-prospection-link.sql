-- Lien fort Collaboration ↔ ProspectionContact (règles TM)
ALTER TABLE "collaborations"
  ADD COLUMN IF NOT EXISTS "prospectionContactId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "collaborations_prospectionContactId_key"
  ON "collaborations"("prospectionContactId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collaborations_prospectionContactId_fkey'
  ) THEN
    ALTER TABLE "collaborations"
      ADD CONSTRAINT "collaborations_prospectionContactId_fkey"
      FOREIGN KEY ("prospectionContactId")
      REFERENCES "prospection_contacts"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
