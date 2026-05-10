-- Neon / PostgreSQL — prestations coiffeur + liaison des disponibilités et réservations publiques.
-- Exécuter après prisma/sql/cannes_coiffeur_neon_core.sql (slots + bookings existent).
--
-- Sur une base ayant encore l’ancienne table `cannes_coiffeur_availabilities` (slotDurationMinutes),
-- ce script ajoute les prestations, rattache chaque règle à la prestation par défaut, retire les colonnes de durée au profit de la prestation.
-- Sur une base vide de dispos, exécuter ensuite prisma/sql/cannes_coiffeur_availabilities.sql à jour.

CREATE TABLE IF NOT EXISTS "cannes_coiffeur_prestations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 5,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cannes_coiffeur_prestations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cannes_coiffeur_prestations_slug_key"
  ON "cannes_coiffeur_prestations"("slug");

CREATE INDEX IF NOT EXISTS "cannes_coiffeur_prestations_active_sort_idx"
  ON "cannes_coiffeur_prestations"("active", "sortOrder");

INSERT INTO "cannes_coiffeur_prestations" ("id","title","slug","durationMinutes","bufferMinutes","sortOrder","active","createdAt","updatedAt")
SELECT 'cannes_pres_coiff_std', 'Séance coiffeur — 45 min', 'seance-45', 45, 5, 0, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "cannes_coiffeur_prestations" WHERE "slug" = 'seance-45');

INSERT INTO "cannes_coiffeur_prestations" ("id","title","slug","durationMinutes","bufferMinutes","sortOrder","active","createdAt","updatedAt")
SELECT 'cannes_pres_coiff_court', 'Rendez-vous court — 30 min', 'rdv-30', 30, 5, 1, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "cannes_coiffeur_prestations" WHERE "slug" = 'rdv-30');

INSERT INTO "cannes_coiffeur_prestations" ("id","title","slug","durationMinutes","bufferMinutes","sortOrder","active","createdAt","updatedAt")
SELECT 'cannes_pres_coiff_long', 'Séance longue — 60 min', 'seance-60', 60, 10, 2, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "cannes_coiffeur_prestations" WHERE "slug" = 'seance-60');

-- Colonne prestation sur réservations (talent / public)
ALTER TABLE "cannes_coiffeur_bookings" ADD COLUMN IF NOT EXISTS "prestationId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_bookings_prestationId_fkey'
  ) THEN
    ALTER TABLE "cannes_coiffeur_bookings"
      ADD CONSTRAINT "cannes_coiffeur_bookings_prestationId_fkey"
      FOREIGN KEY ("prestationId") REFERENCES "cannes_coiffeur_prestations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "cannes_coiffeur_bookings_prestationId_idx"
  ON "cannes_coiffeur_bookings"("prestationId");

-- Migration table disponibilités si ancien schéma
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cannes_coiffeur_availabilities'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cannes_coiffeur_availabilities' AND column_name = 'slotDurationMinutes'
  ) THEN
    ALTER TABLE "cannes_coiffeur_availabilities" ADD COLUMN IF NOT EXISTS "prestationId" TEXT;

    UPDATE "cannes_coiffeur_availabilities" AS a SET "prestationId" = (
      SELECT p.id FROM "cannes_coiffeur_prestations" p
      WHERE p."durationMinutes" >= a."slotDurationMinutes"
      ORDER BY p."durationMinutes" ASC
      LIMIT 1
    ) WHERE a."prestationId" IS NULL;

    UPDATE "cannes_coiffeur_availabilities" SET "prestationId" = 'cannes_pres_coiff_std'
    WHERE "prestationId" IS NULL;

    ALTER TABLE "cannes_coiffeur_availabilities" ALTER COLUMN "prestationId" DROP NOT NULL;

    ALTER TABLE "cannes_coiffeur_availabilities" DROP COLUMN IF EXISTS "slotDurationMinutes";
    ALTER TABLE "cannes_coiffeur_availabilities" DROP COLUMN IF EXISTS "bufferMinutes";

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_availabilities_prestationId_fkey'
    ) THEN
      ALTER TABLE "cannes_coiffeur_availabilities"
        ADD CONSTRAINT "cannes_coiffeur_availabilities_prestationId_fkey"
        FOREIGN KEY ("prestationId") REFERENCES "cannes_coiffeur_prestations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

  END IF;
END $$;

-- Si table déjà créée avec prestationId (nouveau DDL) mais sans FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cannes_coiffeur_availabilities' AND column_name = 'prestationId'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_availabilities_prestationId_fkey'
  ) THEN
    ALTER TABLE "cannes_coiffeur_availabilities"
      ADD CONSTRAINT "cannes_coiffeur_availabilities_prestationId_fkey"
      FOREIGN KEY ("prestationId") REFERENCES "cannes_coiffeur_prestations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Index dispo : seulement si la table existe déjà (sinon le script availabilities.sql le crée).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cannes_coiffeur_availabilities'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "cannes_coiffeur_availabilities_prestationId_idx" ON "cannes_coiffeur_availabilities"("prestationId")';
  END IF;
END $$;

-- Autoriser NULL = disponibilité pour toutes les prestations (reprend après anciennes mig NOT NULL).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cannes_coiffeur_availabilities'
  ) THEN
    EXECUTE 'ALTER TABLE "cannes_coiffeur_availabilities" ALTER COLUMN "prestationId" DROP NOT NULL';
  END IF;
END $$;
