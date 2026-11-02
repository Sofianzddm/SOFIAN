-- Absences sur feuille de temps (déduction journée / demi-journée / minutes)
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "absenceKind" TEXT;
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "absenceMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "absenceLabel" TEXT;
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "absenceSource" TEXT;
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "absenceRequestId" TEXT;
