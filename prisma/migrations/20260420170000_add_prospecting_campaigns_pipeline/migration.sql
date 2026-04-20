-- CreateEnum
CREATE TYPE "ContactMissionStage" AS ENUM (
  'STRATEGY_DEFINED',
  'TO_DRAFT',
  'DRAFTED_FOR_VALIDATION',
  'TO_SEND',
  'SENT',
  'RESPONSE_RECEIVED',
  'IN_NEGOTIATION',
  'WON',
  'LOST'
);

-- CreateTable
CREATE TABLE "talent_prospecting_campaigns" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "talentId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "talent_prospecting_campaigns_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "contact_missions"
ADD COLUMN "campaignId" TEXT,
ADD COLUMN "stage" "ContactMissionStage" NOT NULL DEFAULT 'TO_DRAFT';

-- CreateIndex
CREATE INDEX "talent_prospecting_campaigns_createdById_isActive_createdAt_idx"
ON "talent_prospecting_campaigns"("createdById", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "talent_prospecting_campaigns_talentId_isActive_createdAt_idx"
ON "talent_prospecting_campaigns"("talentId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "contact_missions_campaignId_stage_createdAt_idx"
ON "contact_missions"("campaignId", "stage", "createdAt");

-- AddForeignKey
ALTER TABLE "talent_prospecting_campaigns"
ADD CONSTRAINT "talent_prospecting_campaigns_talentId_fkey"
FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_prospecting_campaigns"
ADD CONSTRAINT "talent_prospecting_campaigns_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_missions"
ADD CONSTRAINT "contact_missions_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "talent_prospecting_campaigns"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
