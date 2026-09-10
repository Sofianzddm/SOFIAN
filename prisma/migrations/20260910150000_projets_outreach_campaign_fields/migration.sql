-- CreateEnum
CREATE TYPE "ProspectingCampaignStatus" AS ENUM (
  'BRIEF',
  'BRANDS',
  'DRAFTING',
  'SENDING',
  'ACTIVE',
  'CLOSED'
);

-- AlterTable
ALTER TABLE "talent_prospecting_campaigns"
ADD COLUMN "ownerTmId" TEXT,
ADD COLUMN "status" "ProspectingCampaignStatus" NOT NULL DEFAULT 'BRIEF',
ADD COLUMN "objective" TEXT,
ADD COLUMN "deliverables" TEXT,
ADD COLUMN "budgetRange" TEXT,
ADD COLUMN "timeline" TEXT,
ADD COLUMN "dos" TEXT,
ADD COLUMN "donts" TEXT,
ADD COLUMN "angles" TEXT,
ADD COLUMN "assets" JSONB,
ADD COLUMN "senderEmail" TEXT DEFAULT 'leyna@glowupagence.fr';

-- CreateTable
CREATE TABLE "prospecting_campaign_events" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT,
  "payload" JSONB,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prospecting_campaign_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "talent_prospecting_campaigns_status_isActive_createdAt_idx"
ON "talent_prospecting_campaigns"("status", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "talent_prospecting_campaigns_ownerTmId_isActive_createdAt_idx"
ON "talent_prospecting_campaigns"("ownerTmId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "prospecting_campaign_events_campaignId_createdAt_idx"
ON "prospecting_campaign_events"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "prospecting_campaign_events_actorId_createdAt_idx"
ON "prospecting_campaign_events"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "talent_prospecting_campaigns"
ADD CONSTRAINT "talent_prospecting_campaigns_ownerTmId_fkey"
FOREIGN KEY ("ownerTmId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecting_campaign_events"
ADD CONSTRAINT "prospecting_campaign_events_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "talent_prospecting_campaigns"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecting_campaign_events"
ADD CONSTRAINT "prospecting_campaign_events_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
