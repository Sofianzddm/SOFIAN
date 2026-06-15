-- Logo / visuel de l'événement (affiché sur la galerie publique du talent)
ALTER TABLE "photo_events"
ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
