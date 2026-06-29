-- Sessions de consultation d'une proposition de partenariat.
-- Permet de mesurer le temps passé, le nombre d'ouvertures et la dernière visite.
-- À appliquer sur Neon (ou via `npx prisma db push`).

CREATE TABLE IF NOT EXISTS "partnership_proposal_views" (
  "id"          TEXT NOT NULL,
  "proposalId"  TEXT NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "userAgent"   TEXT,
  "referrer"    TEXT,
  CONSTRAINT "partnership_proposal_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "partnership_proposal_views_proposalId_idx"
  ON "partnership_proposal_views" ("proposalId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'partnership_proposals') THEN
    ALTER TABLE "partnership_proposal_views"
      ADD CONSTRAINT "partnership_proposal_views_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "partnership_proposals"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
