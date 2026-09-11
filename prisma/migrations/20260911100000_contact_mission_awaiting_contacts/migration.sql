-- Demande de complétion contacts marque : bloque la rédaction tant que non résolu.
ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "awaitingContactsCompletion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "contactsCompletionRequestedAt" TIMESTAMP(3);
