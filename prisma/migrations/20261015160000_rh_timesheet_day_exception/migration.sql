-- AlterTable
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "exception" BOOLEAN NOT NULL DEFAULT false;
