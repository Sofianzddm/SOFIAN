-- Horaires de pause (début / fin) en plus de la durée en minutes
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "breakFrom" TEXT;
ALTER TABLE "rh_timesheet_days" ADD COLUMN IF NOT EXISTS "breakTo" TEXT;
