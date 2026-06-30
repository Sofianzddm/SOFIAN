-- Modèles de mails réutilisables pour le rédacteur admin.
-- Additif, idempotent. À appliquer sur Neon.

CREATE TABLE IF NOT EXISTS "mail_templates" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "bodyHtml"    TEXT NOT NULL,
  "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
  "followups"   JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mail_templates_createdById_idx"
  ON "mail_templates" ("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mail_templates_createdById_fkey'
  ) THEN
    ALTER TABLE "mail_templates"
      ADD CONSTRAINT "mail_templates_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
