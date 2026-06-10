-- Liste HubSpot connectée à la file « À contacter » du module Outreach.
-- Les nouveaux contacts de la liste sont importés automatiquement
-- (synchro manuelle depuis l'UI + cron quotidien).

CREATE TABLE IF NOT EXISTS "outreach_list_configs" (
  "id" TEXT NOT NULL,
  "hubspotListId" TEXT NOT NULL,
  "listName" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "outreach_list_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "outreach_list_configs_hubspotListId_key"
  ON "outreach_list_configs" ("hubspotListId");
