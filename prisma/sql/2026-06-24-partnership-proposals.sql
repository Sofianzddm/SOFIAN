-- Proposition de partenariat partageable (Ski Trip, Coachella, ...).
-- À appliquer sur Neon (ou via `npx prisma db push`).

CREATE TABLE IF NOT EXISTS "partnership_proposals" (
  "id"             TEXT NOT NULL,
  "projetId"       TEXT NOT NULL,
  "projetSlug"     TEXT NOT NULL,
  "publicToken"    TEXT NOT NULL,
  "nomMarque"      TEXT NOT NULL,
  "marqueId"       TEXT,
  "brandLogoUrl"   TEXT,
  "title"          TEXT NOT NULL,
  "subtitle"       TEXT,
  "coverPhotoUrl"  TEXT,
  "accentColor"    TEXT NOT NULL DEFAULT '#B06F70',
  "introMessage"   TEXT,
  "casting"        JSONB NOT NULL DEFAULT '[]',
  "budgetLines"    JSONB NOT NULL DEFAULT '[]',
  "budgetCurrency" TEXT NOT NULL DEFAULT 'EUR',
  "deliverables"   JSONB NOT NULL DEFAULT '[]',
  "photos"         JSONB NOT NULL DEFAULT '[]',
  "eventLocation"  TEXT,
  "eventDateLabel" TEXT,
  "contactName"    TEXT,
  "contactEmail"   TEXT,
  "status"         TEXT NOT NULL DEFAULT 'DRAFT',
  "viewCount"      INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt"   TIMESTAMP(3),
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partnership_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partnership_proposals_publicToken_key"
  ON "partnership_proposals" ("publicToken");
CREATE INDEX IF NOT EXISTS "partnership_proposals_projetId_idx"
  ON "partnership_proposals" ("projetId");
CREATE INDEX IF NOT EXISTS "partnership_proposals_projetSlug_idx"
  ON "partnership_proposals" ("projetSlug");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ProjetEvenement') THEN
    ALTER TABLE "partnership_proposals"
      ADD CONSTRAINT "partnership_proposals_projetId_fkey"
      FOREIGN KEY ("projetId") REFERENCES "ProjetEvenement"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
