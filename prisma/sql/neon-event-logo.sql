-- À exécuter sur Neon : logo / visuel de l'événement.
ALTER TABLE "photo_events"
  ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
