-- Portée des modèles de mails (rédacteur admin vs prospection agences).
-- Additif, idempotent. À appliquer sur Neon.

ALTER TABLE "mail_templates"
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'mailer';

CREATE INDEX IF NOT EXISTS "mail_templates_scope_idx"
  ON "mail_templates" ("scope");
