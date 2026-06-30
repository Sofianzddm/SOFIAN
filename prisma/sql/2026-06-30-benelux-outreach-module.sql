-- Module Prospection BENELUX : cycle de contact prospects clients 45 jours.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Distinct du module Outreach (marques FR) ET du module Prospection Agences :
-- annuaire BENELUX dédié, aucune FK vers marques / marque_contacts / partners.
-- Réutilise l'enum "OutreachTargetStatus" déjà créé par le module Outreach.

CREATE TABLE IF NOT EXISTS "benelux_companies" (
  "id" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "secteur" TEXT,
  "siteWeb" TEXT,
  "ville" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "benelux_companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "benelux_companies_slug_key"
  ON "benelux_companies" ("slug");

CREATE INDEX IF NOT EXISTS "benelux_companies_nom_idx"
  ON "benelux_companies" ("nom");

CREATE TABLE IF NOT EXISTS "benelux_contacts" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "prenom" TEXT NOT NULL,
  "nom" TEXT,
  "email" TEXT,
  "poste" TEXT,
  "language" TEXT NOT NULL DEFAULT 'fr',
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "excluded" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT,
  "perimetre" TEXT,
  "localisation" TEXT,
  "priorite" TEXT,
  "linkedinUrl" TEXT,
  "outreachExcluded" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "benelux_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "benelux_contacts_companyId_email_key"
  ON "benelux_contacts" ("companyId", "email");

CREATE INDEX IF NOT EXISTS "benelux_contacts_companyId_idx"
  ON "benelux_contacts" ("companyId");

DO $$ BEGIN
  ALTER TABLE "benelux_contacts"
    ADD CONSTRAINT "benelux_contacts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "benelux_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "benelux_outreach_targets" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "beneluxContactId" TEXT,
  "firstname" TEXT NOT NULL,
  "lastname" TEXT,
  "email" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
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

  CONSTRAINT "benelux_outreach_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "benelux_outreach_targets_email_key"
  ON "benelux_outreach_targets" ("email");

CREATE INDEX IF NOT EXISTS "benelux_outreach_targets_status_nextRecontactAt_idx"
  ON "benelux_outreach_targets" ("status", "nextRecontactAt");

CREATE INDEX IF NOT EXISTS "benelux_outreach_targets_companyId_idx"
  ON "benelux_outreach_targets" ("companyId");

CREATE INDEX IF NOT EXISTS "benelux_outreach_targets_status_createdAt_idx"
  ON "benelux_outreach_targets" ("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "benelux_outreach_targets"
    ADD CONSTRAINT "benelux_outreach_targets_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "benelux_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "benelux_outreach_targets"
    ADD CONSTRAINT "benelux_outreach_targets_beneluxContactId_fkey"
    FOREIGN KEY ("beneluxContactId") REFERENCES "benelux_contacts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "benelux_outreach_touches" (
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

  CONSTRAINT "benelux_outreach_touches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "benelux_outreach_touches_targetId_cycleNumber_idx"
  ON "benelux_outreach_touches" ("targetId", "cycleNumber");

CREATE INDEX IF NOT EXISTS "benelux_outreach_touches_sentAt_repliedAt_relanceSentAt_idx"
  ON "benelux_outreach_touches" ("sentAt", "repliedAt", "relanceSentAt");

DO $$ BEGIN
  ALTER TABLE "benelux_outreach_touches"
    ADD CONSTRAINT "benelux_outreach_touches_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "benelux_outreach_targets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "benelux_outreach_clicks" (
  "id" TEXT NOT NULL,
  "touchId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "benelux_outreach_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "benelux_outreach_clicks_touchId_clickedAt_idx"
  ON "benelux_outreach_clicks" ("touchId", "clickedAt");

DO $$ BEGIN
  ALTER TABLE "benelux_outreach_clicks"
    ADD CONSTRAINT "benelux_outreach_clicks_touchId_fkey"
    FOREIGN KEY ("touchId") REFERENCES "benelux_outreach_touches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
