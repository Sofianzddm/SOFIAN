-- Colonnes manquantes sur cannes_coiffeur_bookings (lien public manage / cancel, alignement schema.prisma).

ALTER TABLE "cannes_coiffeur_bookings" ADD COLUMN IF NOT EXISTS "cancellationToken" TEXT;

ALTER TABLE "cannes_coiffeur_bookings" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

ALTER TABLE "cannes_coiffeur_bookings" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "cannes_coiffeur_bookings_cancellationToken_key"
  ON "cannes_coiffeur_bookings" ("cancellationToken");
