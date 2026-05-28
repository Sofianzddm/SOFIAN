-- Envoi automatique depuis la boite de Leyna pour les contact_missions du
-- pipeline prospection talent.
--
-- Colonnes ajoutees :
--  - scheduledSendAt   : timestamp d'envoi prevu (now + 30s apres validation)
--  - sentAt            : timestamp d'envoi effectif
--  - sentMessageIds    : { email -> { messageId, threadId, error? } } JSON
--  - sendError         : erreur globale d'envoi (si tous les contacts ont echoue)
--  - relanceSentAt     : timestamp de la relance J+3
--  - relanceMessageIds : { email -> messageId } JSON
--  - relanceError      : erreur globale de relance
--  - replied           : detecte par le cron via checkThreadForReply
--  - openedAt/openCount/lastOpenAt   : tracking ouvertures (pixel)
--  - clickedAt/clickCount/lastClickAt/lastClickUrl : tracking clics

ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "scheduledSendAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sentMessageIds" JSONB,
  ADD COLUMN IF NOT EXISTS "sendError" TEXT,
  ADD COLUMN IF NOT EXISTS "relanceSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "relanceMessageIds" JSONB,
  ADD COLUMN IF NOT EXISTS "relanceError" TEXT,
  ADD COLUMN IF NOT EXISTS "replied" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOpenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "openCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastClickAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastClickUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "clickCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "contact_missions_scheduledSendAt_idx"
  ON "contact_missions" ("scheduledSendAt");

CREATE INDEX IF NOT EXISTS "contact_missions_sentAt_replied_relanceSentAt_idx"
  ON "contact_missions" ("sentAt", "replied", "relanceSentAt");
