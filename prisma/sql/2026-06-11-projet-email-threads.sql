-- Envoi individualisé de la prospection projet : 1 thread Gmail par contact
-- (variables {{prenom}}…). Changement additif.

ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "emailThreads" JSONB NOT NULL DEFAULT '[]';
