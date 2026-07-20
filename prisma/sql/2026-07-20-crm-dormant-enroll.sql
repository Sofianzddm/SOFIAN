-- Enrôlement automatique des contacts CRM dormants dans le cycle outreach 45j.
-- À appliquer sur Neon (idempotent).
--
-- Un contact marque avec email valide, présent dans aucun pipeline outreach,
-- dont la marque n'a ni flux actif (négo/collab/inbound/demande en cours) ni
-- échange récent (< 45j), entre automatiquement en TO_CONTACT après un délai
-- de carence. Ces colonnes tracent le passage du sweep (idempotence).

ALTER TABLE "marque_contacts"
  ADD COLUMN IF NOT EXISTS "outreachEnrolledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "outreachTargetRef" TEXT;
