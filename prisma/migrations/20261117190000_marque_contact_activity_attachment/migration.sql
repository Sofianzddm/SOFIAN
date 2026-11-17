-- PJ PDF sur les notes / activités contact marque
ALTER TABLE "marque_contact_activities"
  ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
