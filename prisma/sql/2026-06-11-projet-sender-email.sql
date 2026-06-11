-- Boîte d'envoi par projet strategy (Ski Trip → Ines) + traçage des mails
-- de prospection envoyés depuis le pipeline marques. Changements additifs.

ALTER TABLE "ProjetEvenement" ADD COLUMN IF NOT EXISTS "senderEmail" TEXT;

ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "lastEmailSentAt" TIMESTAMP(3);
ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "lastEmailFrom" TEXT;
ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "lastEmailThreadId" TEXT;

-- Ski Trip envoie à 100% depuis la boîte d'Ines (si le projet existe déjà).
UPDATE "ProjetEvenement"
SET "senderEmail" = 'ines@glowupagence.fr'
WHERE slug = 'ski-trip' AND "senderEmail" IS NULL;
