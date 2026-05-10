BEGIN;

ALTER TABLE "cannes_coiffeur_bookings"
  ADD COLUMN IF NOT EXISTS "cancellationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "cannes_coiffeur_bookings_cancellation_token_uq"
  ON "cannes_coiffeur_bookings" ("cancellationToken")
  WHERE "cancellationToken" IS NOT NULL;

UPDATE "cannes_coiffeur_bookings"
SET "cancellationToken" = encode(gen_random_bytes(24), 'hex')
WHERE "cancellationToken" IS NULL;

COMMIT;
