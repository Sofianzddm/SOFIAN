-- Idempotent : ajoute les colonnes manquantes de DemandeEntrante
-- (présentes dans le schema Prisma mais jamais créées en prod).
ALTER TABLE "DemandeEntrante"
  ADD COLUMN IF NOT EXISTS "talentEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "talentName" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "extractedBrand" TEXT,
  ADD COLUMN IF NOT EXISTS "extractedBudget" TEXT,
  ADD COLUMN IF NOT EXISTS "extractedDeadline" TEXT,
  ADD COLUMN IF NOT EXISTS "extractedDeliverables" TEXT,
  ADD COLUMN IF NOT EXISTS "briefSummary" TEXT;
