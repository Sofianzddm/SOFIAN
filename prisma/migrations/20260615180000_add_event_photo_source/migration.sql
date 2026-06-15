-- Type de contenu d'une photo d'événement :
-- "OFFICIELLE" (photo officielle) ou "INDIVIDUEL" (contenu individuel)
ALTER TABLE "event_photos" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'OFFICIELLE';
