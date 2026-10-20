-- Relance 2 (J+10 ouvrés après R1) — Outreach Clients FR + BENELUX
ALTER TABLE "outreach_touches"
  ADD COLUMN IF NOT EXISTS "relance2SentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relance2MessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "relance2Error" TEXT;

CREATE INDEX IF NOT EXISTS "outreach_touches_relanceSentAt_relance2SentAt_idx"
  ON "outreach_touches"("relanceSentAt", "relance2SentAt");

ALTER TABLE "benelux_outreach_touches"
  ADD COLUMN IF NOT EXISTS "relance2SentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relance2MessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "relance2Error" TEXT;

CREATE INDEX IF NOT EXISTS "benelux_outreach_touches_relanceSentAt_relance2SentAt_idx"
  ON "benelux_outreach_touches"("relanceSentAt", "relance2SentAt");
