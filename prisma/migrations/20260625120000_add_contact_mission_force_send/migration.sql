-- Permet de forcer l'envoi d'une contact_mission malgre le cooldown
-- anti-spam de 20 jours ("contact deja contacte recemment sur une autre
-- mission"). Quand `forceSend` = true, le cooldown est ignore a l'execution
-- (preflight + executeCastingSend), puis remis a false apres l'envoi.

ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "forceSend" BOOLEAN NOT NULL DEFAULT FALSE;
