-- Neon : lien privé par événement (toutes les photos) -> /photos/event/[slug]
-- Idempotent.
ALTER TABLE "photo_events" ADD COLUMN IF NOT EXISTS "slug" TEXT;

UPDATE "photo_events"
SET "slug" = trim(BOTH '-' FROM regexp_replace(lower("nom"), '[^a-z0-9]+', '-', 'g')) || '-' || substr("id", 1, 6)
WHERE "slug" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "photo_events_slug_key" ON "photo_events"("slug");
