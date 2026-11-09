-- Suivi outreach AM par marque sur les demandes gift
ALTER TABLE "demande_gift_marques"
  ADD COLUMN IF NOT EXISTS "statutContact" TEXT NOT NULL DEFAULT 'A_CONTACTER',
  ADD COLUMN IF NOT EXISTS "contactId" TEXT,
  ADD COLUMN IF NOT EXISTS "contactNom" TEXT,
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "contactedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastRelanceAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relanceCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "lastMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "reponseNote" TEXT;

CREATE INDEX IF NOT EXISTS "demande_gift_marques_contactId_idx"
  ON "demande_gift_marques"("contactId");

CREATE INDEX IF NOT EXISTS "demande_gift_marques_statutContact_idx"
  ON "demande_gift_marques"("statutContact");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'demande_gift_marques_contactId_fkey'
  ) THEN
    ALTER TABLE "demande_gift_marques"
      ADD CONSTRAINT "demande_gift_marques_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "marque_contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
