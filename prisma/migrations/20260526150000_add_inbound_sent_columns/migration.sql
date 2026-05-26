-- Idempotent : ces colonnes existaient déjà en prod (créées par raw SQL),
-- on les déclare officiellement dans le schéma Prisma.
ALTER TABLE "inbound_opportunities"
  ADD COLUMN IF NOT EXISTS "gmailSentMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
