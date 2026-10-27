-- CreateTable
CREATE TABLE "casting_roster_fit_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "market" TEXT NOT NULL DEFAULT 'FR',
    "talentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalBrands" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "currentBrandName" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "casting_roster_fit_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casting_roster_fit_brands" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "company" TEXT,
    "brandResearch" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casting_roster_fit_brands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "casting_roster_fit_jobs_userId_status_idx" ON "casting_roster_fit_jobs"("userId", "status");

-- CreateIndex
CREATE INDEX "casting_roster_fit_jobs_status_updatedAt_idx" ON "casting_roster_fit_jobs"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "casting_roster_fit_brands_jobId_status_sortOrder_idx" ON "casting_roster_fit_brands"("jobId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "casting_roster_fit_brands_jobId_groupKey_key" ON "casting_roster_fit_brands"("jobId", "groupKey");

-- AddForeignKey
ALTER TABLE "casting_roster_fit_jobs" ADD CONSTRAINT "casting_roster_fit_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casting_roster_fit_brands" ADD CONSTRAINT "casting_roster_fit_brands_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "casting_roster_fit_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
