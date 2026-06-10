-- Module Outreach : cycle de contact clients 45 jours (transition HubSpot).
--
-- Tables :
--  - outreach_targets : 1 ligne par client suivi (statut de cycle, compteur 45j,
--    write-back HubSpot). Cycle perpétuel : même après réponse, le client
--    revient en TO_RECONTACT à J+45. Seul un stop manuel sort de la boucle.
--  - outreach_touches : 1 ligne par mail de cycle envoyé (contenu, thread Gmail,
--    relance J+3, tracking ouvertures/clics).

CREATE TYPE "OutreachTargetStatus" AS ENUM (
  'TO_CONTACT',
  'WAITING',
  'TO_RECONTACT',
  'STOPPED'
);

CREATE TABLE IF NOT EXISTS "outreach_targets" (
  "id" TEXT NOT NULL,
  "marqueId" TEXT NOT NULL,
  "marqueContactId" TEXT,
  "firstname" TEXT NOT NULL,
  "lastname" TEXT,
  "email" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "status" "OutreachTargetStatus" NOT NULL DEFAULT 'TO_CONTACT',
  "cycleCount" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3),
  "nextRecontactAt" TIMESTAMP(3),
  "lastRepliedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "stoppedById" TEXT,
  "hubspotContactId" TEXT,
  "hubspotSyncedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "outreach_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "outreach_targets_email_key"
  ON "outreach_targets" ("email");

CREATE INDEX IF NOT EXISTS "outreach_targets_status_nextRecontactAt_idx"
  ON "outreach_targets" ("status", "nextRecontactAt");

CREATE INDEX IF NOT EXISTS "outreach_targets_marqueId_idx"
  ON "outreach_targets" ("marqueId");

CREATE INDEX IF NOT EXISTS "outreach_targets_status_createdAt_idx"
  ON "outreach_targets" ("status", "createdAt");

ALTER TABLE "outreach_targets"
  ADD CONSTRAINT "outreach_targets_marqueId_fkey"
  FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "outreach_targets"
  ADD CONSTRAINT "outreach_targets_marqueContactId_fkey"
  FOREIGN KEY ("marqueContactId") REFERENCES "marque_contacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "outreach_touches" (
  "id" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "cycleNumber" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "sentById" TEXT,
  "threadId" TEXT,
  "messageId" TEXT,
  "sendError" TEXT,
  "relanceSentAt" TIMESTAMP(3),
  "relanceMessageId" TEXT,
  "relanceError" TEXT,
  "repliedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "lastOpenAt" TIMESTAMP(3),
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickedAt" TIMESTAMP(3),
  "lastClickAt" TIMESTAMP(3),
  "lastClickUrl" TEXT,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "outreach_touches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "outreach_touches_targetId_cycleNumber_idx"
  ON "outreach_touches" ("targetId", "cycleNumber");

CREATE INDEX IF NOT EXISTS "outreach_touches_sentAt_repliedAt_relanceSentAt_idx"
  ON "outreach_touches" ("sentAt", "repliedAt", "relanceSentAt");

ALTER TABLE "outreach_touches"
  ADD CONSTRAINT "outreach_touches_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "outreach_targets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
