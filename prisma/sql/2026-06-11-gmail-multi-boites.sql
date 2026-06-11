-- Multi-boîtes Gmail : liaison GmailToken <-> users + boîte expéditrice par client outreach
-- Changements purement additifs (aucun impact sur l'existant / la boîte Leyna).

ALTER TABLE "GmailToken" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "GmailToken" ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "GmailToken_userId_key" ON "GmailToken"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GmailToken_userId_fkey'
  ) THEN
    ALTER TABLE "GmailToken"
      ADD CONSTRAINT "GmailToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "outreach_targets" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT;
ALTER TABLE "outreach_touches" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT;
