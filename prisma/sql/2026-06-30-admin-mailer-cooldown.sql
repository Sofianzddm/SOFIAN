-- Anti double-contact (cooldown 20j Leyna) pour le rédacteur de mails admin.
-- Additif, idempotent. À appliquer sur Neon.

ALTER TABLE "admin_mails"
  ADD COLUMN IF NOT EXISTS "forceSend"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "holdReason" TEXT;
