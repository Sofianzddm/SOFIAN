-- Module Prospection Agences : cycle de contact agences partenaires 45 jours.
--
-- Distinct du module Outreach (marques) : aucune FK vers marques / marque_contacts.
-- Tables :
--  - agency_contacts : contacts (personnes) rattachés à une agence partenaire,
--    pour un envoi groupé mais personnalisé (prénom).
--  - agency_outreach_targets : 1 ligne par contact suivi (statut de cycle,
--    compteur 45j). Cycle perpétuel : même après réponse, le contact revient en
--    TO_RECONTACT à J+45. Seul un stop manuel sort de la boucle.
--  - agency_outreach_touches : 1 ligne par mail de cycle envoyé (contenu, thread
--    Gmail, relance J+3, tracking ouvertures/clics).
--  - agency_outreach_clicks : détail des clics.
--
-- Réutilise l'enum "OutreachTargetStatus" déjà créé par le module Outreach.

CREATE TABLE IF NOT EXISTS "agency_contacts" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "prenom" TEXT NOT NULL,
  "nom" TEXT,
  "email" TEXT NOT NULL,
  "poste" TEXT,
  "language" TEXT NOT NULL DEFAULT 'fr',
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "excluded" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agency_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_contacts_partnerId_email_key"
  ON "agency_contacts" ("partnerId", "email");

CREATE INDEX IF NOT EXISTS "agency_contacts_partnerId_idx"
  ON "agency_contacts" ("partnerId");

ALTER TABLE "agency_contacts"
  ADD CONSTRAINT "agency_contacts_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "partners"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "agency_outreach_targets" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "agencyContactId" TEXT,
  "firstname" TEXT NOT NULL,
  "lastname" TEXT,
  "email" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "partnerSlug" TEXT,
  "language" TEXT NOT NULL DEFAULT 'fr',
  "status" "OutreachTargetStatus" NOT NULL DEFAULT 'TO_CONTACT',
  "fromEmail" TEXT,
  "draftSubject" TEXT,
  "draftBodyHtml" TEXT,
  "cycleCount" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3),
  "nextRecontactAt" TIMESTAMP(3),
  "lastRepliedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "stoppedById" TEXT,
  "autoRescheduleReason" TEXT,
  "autoRescheduledAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agency_outreach_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_outreach_targets_email_key"
  ON "agency_outreach_targets" ("email");

CREATE INDEX IF NOT EXISTS "agency_outreach_targets_status_nextRecontactAt_idx"
  ON "agency_outreach_targets" ("status", "nextRecontactAt");

CREATE INDEX IF NOT EXISTS "agency_outreach_targets_partnerId_idx"
  ON "agency_outreach_targets" ("partnerId");

CREATE INDEX IF NOT EXISTS "agency_outreach_targets_status_createdAt_idx"
  ON "agency_outreach_targets" ("status", "createdAt");

ALTER TABLE "agency_outreach_targets"
  ADD CONSTRAINT "agency_outreach_targets_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "partners"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agency_outreach_targets"
  ADD CONSTRAINT "agency_outreach_targets_agencyContactId_fkey"
  FOREIGN KEY ("agencyContactId") REFERENCES "agency_contacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "agency_outreach_touches" (
  "id" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "cycleNumber" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "fromEmail" TEXT,
  "sentAt" TIMESTAMP(3),
  "sentById" TEXT,
  "threadId" TEXT,
  "messageId" TEXT,
  "sendError" TEXT,
  "relanceSentAt" TIMESTAMP(3),
  "relanceMessageId" TEXT,
  "relanceError" TEXT,
  "relanceCancelledAt" TIMESTAMP(3),
  "relanceCancelledById" TEXT,
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

  CONSTRAINT "agency_outreach_touches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agency_outreach_touches_targetId_cycleNumber_idx"
  ON "agency_outreach_touches" ("targetId", "cycleNumber");

CREATE INDEX IF NOT EXISTS "agency_outreach_touches_sentAt_repliedAt_relanceSentAt_idx"
  ON "agency_outreach_touches" ("sentAt", "repliedAt", "relanceSentAt");

ALTER TABLE "agency_outreach_touches"
  ADD CONSTRAINT "agency_outreach_touches_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "agency_outreach_targets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "agency_outreach_clicks" (
  "id" TEXT NOT NULL,
  "touchId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agency_outreach_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agency_outreach_clicks_touchId_clickedAt_idx"
  ON "agency_outreach_clicks" ("touchId", "clickedAt");

ALTER TABLE "agency_outreach_clicks"
  ADD CONSTRAINT "agency_outreach_clicks_touchId_fkey"
  FOREIGN KEY ("touchId") REFERENCES "agency_outreach_touches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
