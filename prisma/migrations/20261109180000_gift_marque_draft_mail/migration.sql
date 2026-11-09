-- Brouillons mail gift (wizard) — persistés hors envoi
ALTER TABLE "demande_gift_marques" ADD COLUMN IF NOT EXISTS "draftSubject" TEXT;
ALTER TABLE "demande_gift_marques" ADD COLUMN IF NOT EXISTS "draftBodyText" TEXT;
ALTER TABLE "demande_gift_marques" ADD COLUMN IF NOT EXISTS "draftUpdatedAt" TIMESTAMP(3);
