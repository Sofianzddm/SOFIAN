-- CreateTable
CREATE TABLE "casting_project_draft_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalMissions" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "currentBrandName" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "casting_project_draft_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casting_project_draft_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "talentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casting_project_draft_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "casting_project_draft_jobs_userId_status_idx" ON "casting_project_draft_jobs"("userId", "status");

-- CreateIndex
CREATE INDEX "casting_project_draft_jobs_status_updatedAt_idx" ON "casting_project_draft_jobs"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "casting_project_draft_jobs_userId_campaignId_status_idx" ON "casting_project_draft_jobs"("userId", "campaignId", "status");

-- CreateIndex
CREATE INDEX "casting_project_draft_items_jobId_status_sortOrder_idx" ON "casting_project_draft_items"("jobId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "casting_project_draft_items_jobId_missionId_key" ON "casting_project_draft_items"("jobId", "missionId");

-- AddForeignKey
ALTER TABLE "casting_project_draft_jobs" ADD CONSTRAINT "casting_project_draft_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casting_project_draft_items" ADD CONSTRAINT "casting_project_draft_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "casting_project_draft_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
