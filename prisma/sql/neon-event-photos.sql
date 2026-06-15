-- ============================================================
-- Module "Photos d'événements" — à exécuter sur Neon (Postgres)
-- ============================================================
-- Un événement contient des photos ; chaque photo peut taguer
-- plusieurs talents. Chaque talent retrouve ses photos via son
-- lien personnel privé /photos/[galleryToken].
--
-- Idempotent : peut être relancé sans casser (IF NOT EXISTS / DO blocks).
-- ============================================================

-- 1) Token du lien personnel sur les talents
ALTER TABLE "talents"
  ADD COLUMN IF NOT EXISTS "galleryToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "talents_galleryToken_key"
  ON "talents" ("galleryToken");

-- 2) Événements
CREATE TABLE IF NOT EXISTS "photo_events" (
  "id"          TEXT NOT NULL,
  "nom"         TEXT NOT NULL,
  "date"        TIMESTAMP(3),
  "lieu"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "photo_events_createdAt_idx"
  ON "photo_events" ("createdAt");

-- 3) Photos d'un événement
CREATE TABLE IF NOT EXISTS "event_photos" (
  "id"        TEXT NOT NULL,
  "eventId"   TEXT NOT NULL,
  "imageUrl"  TEXT NOT NULL,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "event_photos_eventId_idx"
  ON "event_photos" ("eventId");

-- 4) Tags talent <-> photo
CREATE TABLE IF NOT EXISTS "event_photo_talents" (
  "id"        TEXT NOT NULL,
  "photoId"   TEXT NOT NULL,
  "talentId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_photo_talents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_photo_talents_photoId_talentId_key"
  ON "event_photo_talents" ("photoId", "talentId");

CREATE INDEX IF NOT EXISTS "event_photo_talents_talentId_idx"
  ON "event_photo_talents" ("talentId");

CREATE INDEX IF NOT EXISTS "event_photo_talents_photoId_idx"
  ON "event_photo_talents" ("photoId");

-- 5) Clés étrangères (ajoutées seulement si absentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_photos_eventId_fkey'
  ) THEN
    ALTER TABLE "event_photos"
      ADD CONSTRAINT "event_photos_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "photo_events" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_photo_talents_photoId_fkey'
  ) THEN
    ALTER TABLE "event_photo_talents"
      ADD CONSTRAINT "event_photo_talents_photoId_fkey"
      FOREIGN KEY ("photoId") REFERENCES "event_photos" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_photo_talents_talentId_fkey'
  ) THEN
    ALTER TABLE "event_photo_talents"
      ADD CONSTRAINT "event_photo_talents_talentId_fkey"
      FOREIGN KEY ("talentId") REFERENCES "talents" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
