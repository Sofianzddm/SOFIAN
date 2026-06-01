-- Phase B : tables dédoublonnage IA des marques (à exécuter dans Neon SQL Editor)

CREATE TYPE "MarqueDedupeVerdict" AS ENUM ('MERGE', 'KEEP_SEPARATE', 'NEEDS_REVIEW');

CREATE TYPE "MarqueDedupeSuggestionStatus" AS ENUM (
  'PENDING',
  'AUTO_MERGED',
  'APPROVED',
  'REJECTED',
  'DISCARDED'
);

CREATE TABLE IF NOT EXISTS "marque_dedupe_suggestions" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "marquesSnapshot" JSONB NOT NULL,
  "marqueIds" TEXT[] NOT NULL,
  "verdict" "MarqueDedupeVerdict" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "reasoning" TEXT NOT NULL,
  "recommendedTargetId" TEXT,
  "recommendedSourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "MarqueDedupeSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "mergedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marque_dedupe_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marque_dedupe_decisions" (
  "id" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "marqueIdA" TEXT NOT NULL,
  "marqueIdB" TEXT NOT NULL,
  "verdict" "MarqueDedupeVerdict" NOT NULL,
  "source" TEXT NOT NULL,
  "reasoning" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marque_dedupe_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marque_dedupe_decisions_pairKey_key"
  ON "marque_dedupe_decisions"("pairKey");
CREATE INDEX IF NOT EXISTS "marque_dedupe_suggestions_status_idx"
  ON "marque_dedupe_suggestions"("status");
CREATE INDEX IF NOT EXISTS "marque_dedupe_suggestions_groupKey_idx"
  ON "marque_dedupe_suggestions"("groupKey");
CREATE INDEX IF NOT EXISTS "marque_dedupe_suggestions_runId_idx"
  ON "marque_dedupe_suggestions"("runId");
