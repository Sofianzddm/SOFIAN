-- Tracking d'ouverture (pixel) pour le rédacteur de mails admin.
-- Additif, idempotent. À appliquer sur Neon.

ALTER TABLE "admin_mails"
  ADD COLUMN IF NOT EXISTS "openCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "openedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOpenAt" TIMESTAMP(3);

ALTER TABLE "admin_mail_followups"
  ADD COLUMN IF NOT EXISTS "openCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "openedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOpenAt" TIMESTAMP(3);
