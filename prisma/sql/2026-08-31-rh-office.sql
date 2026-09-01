DO $$ BEGIN
  CREATE TYPE "RhWorkPlace" AS ENUM ('OFFICE', 'REMOTE', 'TRAVEL', 'SITE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "rh_work_days" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "place" "RhWorkPlace" NOT NULL,
  "half" TEXT NOT NULL DEFAULT 'FULL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "rh_work_days" ALTER COLUMN "half" SET DEFAULT 'FULL';
UPDATE "rh_work_days" SET "half" = 'FULL' WHERE "half" IS NULL;
ALTER TABLE "rh_work_days" ALTER COLUMN "half" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "rh_work_days_employeeId_date_half_key"
  ON "rh_work_days"("employeeId", "date", "half");
CREATE INDEX IF NOT EXISTS "rh_work_days_employeeId_date_idx"
  ON "rh_work_days"("employeeId", "date");
