-- AlterTable
ALTER TABLE "public"."contact_missions"
ADD COLUMN IF NOT EXISTS "clientLanguage" TEXT,
ADD COLUMN IF NOT EXISTS "clientContacts" JSONB;
