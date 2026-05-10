-- Neon / PostgreSQL — tables coiffeur Cannes (slots + réservations).
-- À exécuter si `cannes_coiffeur_slots` / `cannes_coiffeur_bookings` sont absentes
-- (équivalent sûr de prisma/migrations/20260510200000_cannes_coiffeur_native_booking, sans DROP des rdvs Cal.com).

DO $$
BEGIN
  ALTER TYPE "Role" ADD VALUE 'COIFFEUR';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CannesCoiffeurBookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "cannes_coiffeur_slots" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "cannes_coiffeur_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cannes_coiffeur_bookings" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "talentId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "notes" TEXT,
    "status" "CannesCoiffeurBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cannes_coiffeur_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cannes_coiffeur_bookings_slotId_key"
  ON "cannes_coiffeur_bookings"("slotId");

CREATE INDEX IF NOT EXISTS "cannes_coiffeur_slots_startsAt_idx"
  ON "cannes_coiffeur_slots"("startsAt");

CREATE INDEX IF NOT EXISTS "cannes_coiffeur_bookings_talentId_idx"
  ON "cannes_coiffeur_bookings"("talentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_slots_createdById_fkey'
  ) THEN
    ALTER TABLE "cannes_coiffeur_slots"
      ADD CONSTRAINT "cannes_coiffeur_slots_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_bookings_slotId_fkey'
  ) THEN
    ALTER TABLE "cannes_coiffeur_bookings"
      ADD CONSTRAINT "cannes_coiffeur_bookings_slotId_fkey"
      FOREIGN KEY ("slotId") REFERENCES "cannes_coiffeur_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_bookings_talentId_fkey'
  ) THEN
    ALTER TABLE "cannes_coiffeur_bookings"
      ADD CONSTRAINT "cannes_coiffeur_bookings_talentId_fkey"
      FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_bookings_createdById_fkey'
  ) THEN
    ALTER TABLE "cannes_coiffeur_bookings"
      ADD CONSTRAINT "cannes_coiffeur_bookings_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Réduction des doublons de fenêtre réservée (conflit → P2002 côté app)
CREATE UNIQUE INDEX IF NOT EXISTS "cannes_coiffeur_slots_active_starts_ends_uidx"
  ON "cannes_coiffeur_slots" ("startsAt", "endsAt")
  WHERE "cancelledAt" IS NULL;
