-- Aligne la base avec schema.prisma : dossiers_prospection + fichiers_prospection.dossierId
-- Idempotent (ré-exécutable) pour les environnements déjà partiellement à jour.

CREATE TABLE IF NOT EXISTS "dossiers_prospection" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dossiers_prospection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dossiers_prospection_userId_idx" ON "dossiers_prospection"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dossiers_prospection_userId_fkey'
  ) THEN
    ALTER TABLE "dossiers_prospection"
      ADD CONSTRAINT "dossiers_prospection_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "fichiers_prospection" ADD COLUMN IF NOT EXISTS "dossierId" TEXT;

CREATE INDEX IF NOT EXISTS "fichiers_prospection_dossierId_idx" ON "fichiers_prospection"("dossierId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fichiers_prospection_dossierId_fkey'
  ) THEN
    ALTER TABLE "fichiers_prospection"
      ADD CONSTRAINT "fichiers_prospection_dossierId_fkey"
      FOREIGN KEY ("dossierId") REFERENCES "dossiers_prospection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
