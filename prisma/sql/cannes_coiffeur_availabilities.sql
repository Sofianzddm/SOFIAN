-- Neon / PostgreSQL — règles de disponibilité type Calendly (prestationId NULL = toutes les prestations).
--
-- Ordre recommandé :
--   1. prisma/sql/cannes_coiffeur_neon_core.sql
--   2. prisma/sql/cannes_coiffeur_prestations.sql
--   3. ce fichier — uniquement si la table n’existait pas encore (install neuve sans migration auto ci-dessus).

CREATE TABLE IF NOT EXISTS "cannes_coiffeur_availabilities" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breaks" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "note" TEXT,
    "prestationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cannes_coiffeur_availabilities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cannes_coiffeur_availabilities_date_idx"
  ON "cannes_coiffeur_availabilities"("date");

CREATE INDEX IF NOT EXISTS "cannes_coiffeur_availabilities_prestationId_idx"
  ON "cannes_coiffeur_availabilities"("prestationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cannes_coiffeur_availabilities_prestationId_fkey'
  ) THEN
    ALTER TABLE "cannes_coiffeur_availabilities"
      ADD CONSTRAINT "cannes_coiffeur_availabilities_prestationId_fkey"
      FOREIGN KEY ("prestationId") REFERENCES "cannes_coiffeur_prestations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
