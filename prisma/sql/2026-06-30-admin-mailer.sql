-- Rédacteur de mails admin : tables additives (aucun impact sur l'existant).
-- À appliquer sur Neon. Idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "admin_mails" (
  "id"               TEXT NOT NULL,
  "fromEmail"        TEXT NOT NULL,
  "toEmail"          TEXT NOT NULL,
  "toName"           TEXT,
  "subject"          TEXT NOT NULL,
  "bodyHtml"         TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'DRAFT',
  "scheduledAt"      TIMESTAMP(3),
  "sentAt"           TIMESTAMP(3),
  "threadId"         TEXT,
  "gmailMessageId"   TEXT,
  "messageRfcId"     TEXT,
  "sendError"        TEXT,
  "stopOnReply"      BOOLEAN NOT NULL DEFAULT true,
  "repliedAt"        TIMESTAMP(3),
  "lastReplyCheckAt" TIMESTAMP(3),
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_mails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "admin_mail_followups" (
  "id"                TEXT NOT NULL,
  "mailId"            TEXT NOT NULL,
  "order"             INTEGER NOT NULL,
  "delayBusinessDays" INTEGER NOT NULL DEFAULT 3,
  "subject"           TEXT,
  "bodyHtml"          TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "scheduledAt"       TIMESTAMP(3),
  "sentAt"            TIMESTAMP(3),
  "gmailMessageId"    TEXT,
  "sendError"         TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_mail_followups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_mails_status_scheduledAt_idx" ON "admin_mails" ("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "admin_mails_createdById_idx" ON "admin_mails" ("createdById");
CREATE INDEX IF NOT EXISTS "admin_mail_followups_mailId_idx" ON "admin_mail_followups" ("mailId");
CREATE INDEX IF NOT EXISTS "admin_mail_followups_status_scheduledAt_idx" ON "admin_mail_followups" ("status", "scheduledAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_mails_createdById_fkey'
  ) THEN
    ALTER TABLE "admin_mails"
      ADD CONSTRAINT "admin_mails_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_mail_followups_mailId_fkey'
  ) THEN
    ALTER TABLE "admin_mail_followups"
      ADD CONSTRAINT "admin_mail_followups_mailId_fkey"
      FOREIGN KEY ("mailId") REFERENCES "admin_mails" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
