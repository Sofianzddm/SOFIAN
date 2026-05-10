-- Neon / PostgreSQL — colonnes annulation + token (sans dépendre de pgcrypto).
--
-- Si Neon affiche "current transaction is aborted" / "ROLLBACK required" :
--   1) Exécute : ROLLBACK;
--   2) Relance ce fichier (ou les blocs ci-dessous un par un).

ALTER TABLE "cannes_coiffeur_bookings"
  ADD COLUMN IF NOT EXISTS "cancellationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "cannes_coiffeur_bookings_cancellation_token_uq"
  ON "cannes_coiffeur_bookings" ("cancellationToken")
  WHERE "cancellationToken" IS NOT NULL;

-- 48 caractères hex (équivalent 24 octets), sans gen_random_bytes / pgcrypto
UPDATE "cannes_coiffeur_bookings"
SET "cancellationToken" = substring(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  1,
  48
)
WHERE "cancellationToken" IS NULL;
