-- Neon : type de contenu d'une photo d'événement.
-- "OFFICIELLE" (photo officielle) ou "INDIVIDUEL" (contenu individuel).
-- Idempotent. Les photos existantes sont considérées comme officielles.
ALTER TABLE "event_photos" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'OFFICIELLE';
