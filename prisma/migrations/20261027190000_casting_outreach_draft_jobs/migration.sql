-- Casting Outreach draft jobs (VPS / survivre à la fermeture de page)
CREATE TABLE IF NOT EXISTS "casting_outreach_draft_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "market" TEXT NOT NULL DEFAULT 'FR',
    "totalBrands" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "currentBrandName" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "casting_outreach_draft_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "casting_outreach_draft_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "company" TEXT,
    "pipeline" TEXT NOT NULL DEFAULT 'FR',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "talentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brandResearch" JSONB NOT NULL,
    "rosterFits" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "draftSubject" TEXT,
    "draftBodyHtml" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casting_outreach_draft_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "casting_outreach_draft_jobs_userId_status_idx"
  ON "casting_outreach_draft_jobs"("userId", "status");
CREATE INDEX IF NOT EXISTS "casting_outreach_draft_jobs_status_updatedAt_idx"
  ON "casting_outreach_draft_jobs"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "casting_outreach_draft_jobs_userId_market_status_idx"
  ON "casting_outreach_draft_jobs"("userId", "market", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "casting_outreach_draft_items_jobId_groupKey_key"
  ON "casting_outreach_draft_items"("jobId", "groupKey");
CREATE INDEX IF NOT EXISTS "casting_outreach_draft_items_jobId_status_sortOrder_idx"
  ON "casting_outreach_draft_items"("jobId", "status", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "casting_outreach_draft_jobs"
    ADD CONSTRAINT "casting_outreach_draft_jobs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "casting_outreach_draft_items"
    ADD CONSTRAINT "casting_outreach_draft_items_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "casting_outreach_draft_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
