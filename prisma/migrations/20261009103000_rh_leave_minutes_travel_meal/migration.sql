-- Récup / absences courtes en minutes + repas déplacement (TR)
ALTER TABLE "rh_leave_days" ADD COLUMN IF NOT EXISTS "minutes" INTEGER;
ALTER TABLE "rh_work_days" ADD COLUMN IF NOT EXISTS "travelMeal" TEXT;
ALTER TABLE "rh_work_days" ADD COLUMN IF NOT EXISTS "portion" TEXT NOT NULL DEFAULT 'FULL';
