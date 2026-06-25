-- Applique les CPM EMV (marché France 2026) au projet "ski-trip".
-- CPM = € / 1 000 personnes touchées, par type de contenu :
--   Instagram Story        7
--   Instagram Reel        20
--   Instagram Post        16
--   Instagram Carrousel   17
--   TikTok                20
--   YouTube Short         22
--   Vidéo YouTube longue  40
-- À appliquer sur Neon.

UPDATE "partnership_proposals"
SET "emvConfig" = jsonb_build_object(
  'formatCpm', jsonb_build_object(
    'story', 7,
    'reel', 20,
    'post', 16,
    'carrousel', 17,
    'tiktok', 20,
    'ytShort', 22,
    'ytVideo', 40,
    'default', 20
  ),
  'defaultReachRate', COALESCE(("emvConfig" #>> '{defaultReachRate}')::numeric, 0.6)
)
WHERE "projetSlug" = 'ski-trip';
