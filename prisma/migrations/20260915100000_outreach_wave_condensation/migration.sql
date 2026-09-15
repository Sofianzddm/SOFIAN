-- CreateEnum
CREATE TYPE "OutreachWaveStatus" AS ENUM ('COLLECTING', 'REVIEWING_CONDENSATIONS', 'OPEN_FOR_DRAFTING', 'CLOSED');

-- CreateEnum
CREATE TYPE "OutreachWaveClusterDecision" AS ENUM ('PENDING', 'CONDENSE', 'SOLO');

-- CreateEnum
CREATE TYPE "CondensationRole" AS ENUM ('PRIMARY', 'MEMBER');

-- CreateEnum
CREATE TYPE "CondensationStatus" AS ENUM ('NONE', 'IN_WAVE', 'PROPOSED', 'CONDENSED', 'SOLO', 'EXCLUDED');

-- CreateTable
CREATE TABLE "outreach_waves" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "OutreachWaveStatus" NOT NULL DEFAULT 'COLLECTING',
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_wave_brand_clusters" (
    "id" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "marqueId" TEXT,
    "targetBrandKey" TEXT NOT NULL,
    "targetBrand" TEXT NOT NULL,
    "decision" "OutreachWaveClusterDecision" NOT NULL DEFAULT 'PENDING',
    "primaryMissionId" TEXT,
    "condensationGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_wave_brand_clusters_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "talent_prospecting_campaigns" ADD COLUMN "waveId" TEXT;

-- AlterTable
ALTER TABLE "contact_missions" ADD COLUMN "condensationGroupId" TEXT,
ADD COLUMN "condensationRole" "CondensationRole",
ADD COLUMN "condensationStatus" "CondensationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "waveClusterId" TEXT;

-- CreateIndex
CREATE INDEX "outreach_waves_status_createdAt_idx" ON "outreach_waves"("status", "createdAt");

-- CreateIndex
CREATE INDEX "outreach_waves_createdById_createdAt_idx" ON "outreach_waves"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "outreach_wave_brand_clusters_waveId_decision_idx" ON "outreach_wave_brand_clusters"("waveId", "decision");

-- CreateIndex
CREATE INDEX "outreach_wave_brand_clusters_targetBrandKey_idx" ON "outreach_wave_brand_clusters"("targetBrandKey");

-- CreateIndex
CREATE INDEX "outreach_wave_brand_clusters_marqueId_idx" ON "outreach_wave_brand_clusters"("marqueId");

-- CreateIndex
CREATE INDEX "talent_prospecting_campaigns_waveId_idx" ON "talent_prospecting_campaigns"("waveId");

-- CreateIndex
CREATE INDEX "contact_missions_condensationGroupId_idx" ON "contact_missions"("condensationGroupId");

-- CreateIndex
CREATE INDEX "contact_missions_waveClusterId_idx" ON "contact_missions"("waveClusterId");

-- AddForeignKey
ALTER TABLE "outreach_waves" ADD CONSTRAINT "outreach_waves_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_waves" ADD CONSTRAINT "outreach_waves_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_waves" ADD CONSTRAINT "outreach_waves_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_wave_brand_clusters" ADD CONSTRAINT "outreach_wave_brand_clusters_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "outreach_waves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_prospecting_campaigns" ADD CONSTRAINT "talent_prospecting_campaigns_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "outreach_waves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_missions" ADD CONSTRAINT "contact_missions_waveClusterId_fkey" FOREIGN KEY ("waveClusterId") REFERENCES "outreach_wave_brand_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
