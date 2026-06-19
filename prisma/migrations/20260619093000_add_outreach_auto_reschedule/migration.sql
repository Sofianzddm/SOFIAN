-- Replanification automatique d'un client Outreach : quand l'envoi est bloqué
-- car le client a déjà été contacté < 45j via un autre canal (séquence HubSpot,
-- mail manuel…), on cale le compteur sur la date réelle du mail + 45j et on
-- conserve la raison pour l'afficher. Effacé au prochain envoi réel depuis l'app.

ALTER TABLE "outreach_targets"
  ADD COLUMN IF NOT EXISTS "autoRescheduleReason" TEXT,
  ADD COLUMN IF NOT EXISTS "autoRescheduledAt" TIMESTAMP(3);
