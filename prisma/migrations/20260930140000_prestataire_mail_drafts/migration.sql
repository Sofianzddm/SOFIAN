-- Brouillons / envoi mail depuis le projet (ligne presta)
ALTER TABLE "talent_prospecting_campaign_prestataires"
  ADD COLUMN IF NOT EXISTS "draftEmailSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "draftEmailBody" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sendError" TEXT,
  ADD COLUMN IF NOT EXISTS "sentToEmails" JSONB;
