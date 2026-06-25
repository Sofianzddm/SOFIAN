-- Neon : ajout du flag forceSend sur contact_missions.
-- Permet de forcer l'envoi malgre le cooldown anti-spam de 20 jours.
ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "forceSend" BOOLEAN NOT NULL DEFAULT FALSE;
