-- Projet outreach Solo | Multiples
CREATE TYPE "ProspectingCampaignMode" AS ENUM ('SOLO', 'MULTI');

ALTER TABLE "talent_prospecting_campaigns"
  ADD COLUMN IF NOT EXISTS "mode" "ProspectingCampaignMode" NOT NULL DEFAULT 'SOLO';

CREATE INDEX IF NOT EXISTS "talent_prospecting_campaigns_mode_isActive_createdAt_idx"
  ON "talent_prospecting_campaigns"("mode", "isActive", "createdAt");

ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "selectedTalentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "talent_prospecting_campaign_talents" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "talentId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "talent_prospecting_campaign_talents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "talent_prospecting_campaign_talents_campaignId_talentId_key"
  ON "talent_prospecting_campaign_talents"("campaignId", "talentId");

CREATE INDEX IF NOT EXISTS "talent_prospecting_campaign_talents_talentId_idx"
  ON "talent_prospecting_campaign_talents"("talentId");

CREATE INDEX IF NOT EXISTS "talent_prospecting_campaign_talents_campaignId_sortOrder_idx"
  ON "talent_prospecting_campaign_talents"("campaignId", "sortOrder");

ALTER TABLE "talent_prospecting_campaign_talents"
  DROP CONSTRAINT IF EXISTS "talent_prospecting_campaign_talents_campaignId_fkey",
  DROP CONSTRAINT IF EXISTS "talent_prospecting_campaign_talents_talentId_fkey";

ALTER TABLE "talent_prospecting_campaign_talents"
  ADD CONSTRAINT "talent_prospecting_campaign_talents_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "talent_prospecting_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "talent_prospecting_campaign_talents_talentId_fkey"
    FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill : 1 ligne jointure = talent principal pour chaque campagne existante
INSERT INTO "talent_prospecting_campaign_talents" ("id", "campaignId", "talentId", "sortOrder", "createdAt")
SELECT
  'ct_' || c."id",
  c."id",
  c."talentId",
  0,
  CURRENT_TIMESTAMP
FROM "talent_prospecting_campaigns" c
WHERE NOT EXISTS (
  SELECT 1 FROM "talent_prospecting_campaign_talents" t WHERE t."campaignId" = c."id"
);
