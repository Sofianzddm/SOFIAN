-- Inbound opportunities module (manual SQL for Neon editor)

CREATE TYPE "InboundCategory" AS ENUM (
  'COLLAB_PAID',
  'COLLAB_GIFTING',
  'PRESS_KIT',
  'EVENT_INVITE',
  'OTHER'
);

CREATE TYPE "InboundPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TYPE "InboundStatus" AS ENUM ('NEW', 'IN_REVIEW', 'CONVERTED', 'ARCHIVED');

ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'INBOUND_OPPORTUNITY';

CREATE TABLE "inbound_opportunities" (
  "id" TEXT NOT NULL,
  "talentEmail" TEXT NOT NULL,
  "talentName" TEXT NOT NULL,
  "talentId" TEXT,
  "senderEmail" TEXT NOT NULL,
  "senderName" TEXT,
  "senderDomain" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyExcerpt" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "category" "InboundCategory" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "priority" "InboundPriority" NOT NULL DEFAULT 'MEDIUM',
  "extractedBrand" TEXT,
  "extractedTopic" TEXT,
  "extractedBudget" TEXT,
  "extractedDeadline" TEXT,
  "extractedDeliverables" TEXT,
  "briefSummary" TEXT,
  "status" "InboundStatus" NOT NULL DEFAULT 'NEW',
  "convertedToProspectionId" TEXT,
  "convertedAt" TIMESTAMP(3),
  "convertedById" TEXT,
  "archivedAt" TIMESTAMP(3),
  "archivedById" TEXT,
  "archivedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "inbound_opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inbound_opportunities_gmailMessageId_key" UNIQUE ("gmailMessageId"),
  CONSTRAINT "inbound_opportunities_convertedToProspectionId_key" UNIQUE ("convertedToProspectionId")
);

CREATE INDEX "inbound_opportunities_status_idx" ON "inbound_opportunities"("status");
CREATE INDEX "inbound_opportunities_receivedAt_idx" ON "inbound_opportunities"("receivedAt");
CREATE INDEX "inbound_opportunities_talentId_idx" ON "inbound_opportunities"("talentId");
CREATE INDEX "inbound_opportunities_senderDomain_idx" ON "inbound_opportunities"("senderDomain");

ALTER TABLE "inbound_opportunities"
  ADD CONSTRAINT "inbound_opportunities_talentId_fkey"
  FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inbound_opportunities"
  ADD CONSTRAINT "inbound_opportunities_convertedById_fkey"
  FOREIGN KEY ("convertedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inbound_opportunities"
  ADD CONSTRAINT "inbound_opportunities_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Draft email fields (same drafting flow as casting outreach)
ALTER TABLE "inbound_opportunities"
  ADD COLUMN IF NOT EXISTS "draftEmailSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "draftEmailBody" TEXT;
