-- Relance auto gift J+2 : snapshot mail + langue + expéditeur + stop manuel
ALTER TABLE "demande_gift_marques"
  ADD COLUMN IF NOT EXISTS "lastBodyText" TEXT,
  ADD COLUMN IF NOT EXISTS "contactLanguage" TEXT,
  ADD COLUMN IF NOT EXISTS "sentById" TEXT,
  ADD COLUMN IF NOT EXISTS "relanceCancelledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "demande_gift_marques_contactedAt_relance_idx"
  ON "demande_gift_marques"("contactedAt", "lastRelanceAt", "relanceCancelledAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'demande_gift_marques_sentById_fkey'
  ) THEN
    ALTER TABLE "demande_gift_marques"
      ADD CONSTRAINT "demande_gift_marques_sentById_fkey"
      FOREIGN KEY ("sentById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
