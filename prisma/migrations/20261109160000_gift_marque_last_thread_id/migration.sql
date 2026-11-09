-- Thread Gmail pour relances gift dans le même fil
ALTER TABLE "demande_gift_marques"
  ADD COLUMN IF NOT EXISTS "lastThreadId" TEXT;
