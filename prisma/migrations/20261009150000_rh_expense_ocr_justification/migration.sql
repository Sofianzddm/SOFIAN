-- AlterTable
ALTER TABLE "rh_expense_lines" ADD COLUMN IF NOT EXISTS "justification" TEXT;
ALTER TABLE "rh_expense_lines" ADD COLUMN IF NOT EXISTS "talentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "rh_expense_lines" ADD COLUMN IF NOT EXISTS "analyseIA" JSONB;
ALTER TABLE "rh_expense_lines" ADD COLUMN IF NOT EXISTS "ocrVerified" BOOLEAN NOT NULL DEFAULT false;
