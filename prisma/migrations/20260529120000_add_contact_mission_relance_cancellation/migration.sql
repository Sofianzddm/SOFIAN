-- Permet a l'utilisateur (Head of Sales / Strategy Planner / Admin) de stopper
-- manuellement la relance auto J+3 d'une carte du pipeline prospection talent.
--
-- Le cron `casting-relances` ignorera toutes les missions ou `relanceCancelledAt`
-- n'est pas NULL. L'utilisateur peut reactiver la relance en repassant le champ
-- a NULL via l'endpoint dedie.

ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "relanceCancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relanceCancelledById" TEXT;

CREATE INDEX IF NOT EXISTS "contact_missions_relanceCancelledAt_idx"
  ON "contact_missions" ("relanceCancelledAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contact_missions_relanceCancelledById_fkey'
      AND table_name = 'contact_missions'
  ) THEN
    ALTER TABLE "contact_missions"
      ADD CONSTRAINT "contact_missions_relanceCancelledById_fkey"
      FOREIGN KEY ("relanceCancelledById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
