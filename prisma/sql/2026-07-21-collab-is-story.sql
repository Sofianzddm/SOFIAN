-- Lien de publication obligatoire avant facturation.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Ajoute un marqueur "isStory" sur les collaborations : une Story n'a pas de
-- lien permanent, donc on coche cette case au lieu de saisir un lien. Le lien
-- de publication devient obligatoire pour passer une collab en "Publié" (donc
-- avant facturation), sauf si isStory = true. La community manager retrouve
-- ainsi toutes les collabs (lien ou story) au même endroit.

ALTER TABLE "collaborations"
  ADD COLUMN IF NOT EXISTS "isStory" BOOLEAN NOT NULL DEFAULT false;
