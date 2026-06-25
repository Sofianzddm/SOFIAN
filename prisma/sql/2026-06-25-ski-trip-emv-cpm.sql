-- Applique les CPM EMV (marché France 2026) au projet "ski-trip".
-- CPM = € / 1 000 personnes touchées, par type de contenu :
--   Instagram Story        9
--   Instagram Reel        25
--   Instagram Post        20
--   Instagram Carrousel   22
--   TikTok                25
--   YouTube Short         28
--   Vidéo YouTube longue  45
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
)
WHERE "projetSlug" = 'ski-trip';
