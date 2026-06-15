-- Lien privé regroupant toutes les photos d'un événement : /photos/event/[slug]
ALTER TABLE "photo_events" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill : slug lisible dérivé du nom + suffixe court (id) pour garantir l'unicité.
UPDATE "photo_events"
SET "slug" = trim(BOTH '-' FROM regexp_replace(lower("nom"), '[^a-z0-9]+', '-', 'g')) || '-' || substr("id", 1, 6)
WHERE "slug" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "photo_events_slug_key" ON "photo_events"("slug");
