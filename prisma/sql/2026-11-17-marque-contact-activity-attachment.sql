-- PJ PDF sur les notes contact (Neon — idempotent)
ALTER TABLE "marque_contact_activities"
  ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
