-- Uniformise la méthode EMV (CPM marché France 2026) sur TOUTES les propositions,
-- tous projets confondus — même table que le projet "ski-trip".
-- CPM = € / 1 000 personnes touchées, par type de contenu :
--   Instagram Story        9
--   Instagram Reel        25
--   Instagram Post        20
--   Instagram Carrousel   22
--   TikTok                25
--   YouTube Short         28
--   Vidéo YouTube longue  45
-- defaultReachRate : conservé si déjà défini, sinon 0.6.
-- À appliquer sur Neon.

UPDATE "partnership_proposals"
SET "emvConfig" = jsonb_build_object(
  'formatCpm', jsonb_build_object(
    'story', 9,
    'reel', 25,
    'post', 20,
    'carrousel', 22,
    'tiktok', 25,
    'ytShort', 28,
    'ytVideo', 45,
    'default', 25
  ),
  'defaultReachRate', COALESCE(("emvConfig" #>> '{defaultReachRate}')::numeric, 0.6)
);
