-- Suivi du mail de prospection des opportunités projet (Ski Trip…) :
-- ouvertures (pixel), réponse (thread Gmail), relance auto J+3 ouvrés.
-- Changements purement additifs.

ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "emailSubject" TEXT;
ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "emailOpenedAt" TIMESTAMP(3);
ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "emailOpenCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "emailRepliedAt" TIMESTAMP(3);
ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "relanceSentAt" TIMESTAMP(3);
ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "relanceError" TEXT;
