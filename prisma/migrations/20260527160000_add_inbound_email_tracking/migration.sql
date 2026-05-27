-- Tracking des ouvertures et clics des mails sortants depuis /casting-mails-sent.
-- Le pixel et les liens réécrits écrivent dans ces colonnes.
ALTER TABLE "inbound_opportunities"
  ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOpenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "openCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastClickAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastClickUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "clickCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "inbound_opportunities_openedAt_idx"
  ON "inbound_opportunities" ("openedAt");

-- Relances automatiques (cron /api/cron/relances). Les colonnes étaient
-- déjà référencées en raw SQL mais jamais créées formellement → bug latent.
ALTER TABLE "inbound_opportunities"
  ADD COLUMN IF NOT EXISTS "relance1SentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relance2SentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "replied" BOOLEAN NOT NULL DEFAULT FALSE;
