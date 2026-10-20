-- CreateTable multi-assignés
CREATE TABLE IF NOT EXISTS "rh_task_assignees" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_task_assignees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rh_task_assignees_taskId_employeeId_key" ON "rh_task_assignees"("taskId", "employeeId");
CREATE INDEX IF NOT EXISTS "rh_task_assignees_employeeId_idx" ON "rh_task_assignees"("employeeId");

ALTER TABLE "rh_task_assignees"
  DROP CONSTRAINT IF EXISTS "rh_task_assignees_taskId_fkey";
ALTER TABLE "rh_task_assignees"
  ADD CONSTRAINT "rh_task_assignees_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "rh_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rh_task_assignees"
  DROP CONSTRAINT IF EXISTS "rh_task_assignees_employeeId_fkey";
ALTER TABLE "rh_task_assignees"
  ADD CONSTRAINT "rh_task_assignees_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "rh_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill depuis assigneeId principal
INSERT INTO "rh_task_assignees" ("id", "taskId", "employeeId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), t."id", t."assigneeId", t."createdAt"
FROM "rh_tasks" t
WHERE NOT EXISTS (
  SELECT 1 FROM "rh_task_assignees" a
  WHERE a."taskId" = t."id" AND a."employeeId" = t."assigneeId"
);

-- Mentions sur commentaires
ALTER TABLE "rh_task_comments"
  ADD COLUMN IF NOT EXISTS "mentionedIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
