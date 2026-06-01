-- Cloisonnement pôle Sales vs Talent Managers
-- Permet à la HEAD_OF_SALES de créer des collaborations privées,
-- invisibles pour les TM et les autres rôles (sauf ADMIN + créateur).

ALTER TABLE "collaborations"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- Index pour accélérer les filtres
CREATE INDEX IF NOT EXISTS "collaborations_createdById_idx"
  ON "collaborations" ("createdById");

CREATE INDEX IF NOT EXISTS "collaborations_isPrivate_idx"
  ON "collaborations" ("isPrivate");

-- Clé étrangère vers users (création par un utilisateur)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'collaborations_createdById_fkey'
      AND table_name = 'collaborations'
  ) THEN
    ALTER TABLE "collaborations"
      ADD CONSTRAINT "collaborations_createdById_fkey"
      FOREIGN KEY ("createdById")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;
