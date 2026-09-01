-- Suivi ouverture + relances + snapshot confirmé sur talent_confirmations.
-- Idempotent : safe si les colonnes existent déjà.

ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "confirmedSnapshot" JSONB;
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3);
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "openCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "reminderCount" INTEGER NOT NULL DEFAULT 0;
