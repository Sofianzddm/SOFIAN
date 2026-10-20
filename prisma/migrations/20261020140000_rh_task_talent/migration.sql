-- AlterTable
ALTER TABLE "rh_tasks" ADD COLUMN IF NOT EXISTS "talentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "rh_tasks_talentId_idx" ON "rh_tasks"("talentId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rh_tasks"
    ADD CONSTRAINT "rh_tasks_talentId_fkey"
    FOREIGN KEY ("talentId") REFERENCES "talents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
