-- ─────────────────────────────────────────────────────────────────────
-- FIX MARK-RELANCE-SENT en prod Neon
-- ─────────────────────────────────────────────────────────────────────
-- Symptôme : POST /api/strategy/contact-missions/.../mark-relance-sent → 500
-- Cause probable : colonnes manquantes sur "contact_missions" en prod
-- (migration 20260529120000 pas appliquée → Prisma plante en accédant à
--  relanceCancelledAt / relanceCancelledById).
--
-- À exécuter dans le Neon SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────

-- 1) Crée les colonnes manquantes (no-op si déjà là)
ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "relanceSentAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relanceMessageIds"    JSONB,
  ADD COLUMN IF NOT EXISTS "relanceError"         TEXT,
  ADD COLUMN IF NOT EXISTS "relanceCancelledAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relanceCancelledById" TEXT;

-- 2) Index utilisés par l'app (idempotent)
CREATE INDEX IF NOT EXISTS "contact_missions_relanceCancelledAt_idx"
  ON "contact_missions" ("relanceCancelledAt");

CREATE INDEX IF NOT EXISTS "contact_missions_sentAt_replied_relanceSentAt_idx"
  ON "contact_missions" ("sentAt", "replied", "relanceSentAt");

-- 3) FK vers users (idempotent — vérifie avant de créer)
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

-- 4) Ajoute la valeur RELANCED à l'enum si absente (idempotent)
ALTER TYPE "ContactMissionStatus" ADD VALUE IF NOT EXISTS 'RELANCED';

-- ─────────────────────────────────────────────────────────────────────
-- AUDIT — vérifie que c'est OK
-- ─────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contact_missions'
  AND column_name IN (
    'relanceSentAt',
    'relanceMessageIds',
    'relanceError',
    'relanceCancelledAt',
    'relanceCancelledById',
    'status',
    'sentAt'
  )
ORDER BY column_name;

-- ─────────────────────────────────────────────────────────────────────
-- RATTRAPAGE PERRIER (ou n'importe quelle mission)
-- ─────────────────────────────────────────────────────────────────────
-- Étape A : trouve la mission Perrier (récupère l'ID)
SELECT id, "targetBrand", "sentAt", "relanceSentAt", status, replied
FROM "contact_missions"
WHERE "targetBrand" ILIKE '%perrier%'
ORDER BY "sentAt" DESC NULLS LAST
LIMIT 5;

-- Étape B : marque-la comme relancée
-- ⚠️ REMPLACE l'ID ci-dessous par celui retourné à l'étape A
-- (le tien d'après la console : cmoin8pt80017jx05iq3vkuiz)
UPDATE "contact_missions"
SET
  "relanceSentAt" = NOW(),
  "status"        = 'RELANCED'::"ContactMissionStatus"
WHERE id = 'cmoin8pt80017jx05iq3vkuiz'
  AND "relanceSentAt" IS NULL
RETURNING id, "targetBrand", "relanceSentAt", status;

-- Variante : marque TOUTES les missions Perrier d'un coup
-- UPDATE "contact_missions"
-- SET "relanceSentAt" = NOW(), "status" = 'RELANCED'::"ContactMissionStatus"
-- WHERE "targetBrand" ILIKE '%perrier%'
--   AND "sentAt" IS NOT NULL
--   AND "relanceSentAt" IS NULL
--   AND replied = false
-- RETURNING id, "targetBrand", "relanceSentAt";
