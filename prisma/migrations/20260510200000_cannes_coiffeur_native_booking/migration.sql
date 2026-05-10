-- Adapté PostgreSQL : rôle COIFFEUR, réservation coiffeur native Cannes (slots + réservations).

DO $$
BEGIN
  ALTER TYPE "Role" ADD VALUE 'COIFFEUR';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP TABLE IF EXISTS "cannes_coiffeur_rdvs";

CREATE TYPE "CannesCoiffeurBookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

CREATE TABLE "cannes_coiffeur_slots" (
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

CREATE TABLE "cannes_coiffeur_bookings" (
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

CREATE UNIQUE INDEX "cannes_coiffeur_bookings_slotId_key" ON "cannes_coiffeur_bookings"("slotId");

CREATE INDEX "cannes_coiffeur_slots_startsAt_idx" ON "cannes_coiffeur_slots"("startsAt");

CREATE INDEX "cannes_coiffeur_bookings_talentId_idx" ON "cannes_coiffeur_bookings"("talentId");

ALTER TABLE "cannes_coiffeur_slots" ADD CONSTRAINT "cannes_coiffeur_slots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cannes_coiffeur_bookings" ADD CONSTRAINT "cannes_coiffeur_bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "cannes_coiffeur_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cannes_coiffeur_bookings" ADD CONSTRAINT "cannes_coiffeur_bookings_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cannes_coiffeur_bookings" ADD CONSTRAINT "cannes_coiffeur_bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
