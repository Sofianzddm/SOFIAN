-- =============================================================================
-- GLOW UP — Fusion automatique des doublons de marques (même slug)
--
-- Prérequis : blocs 1–4 de neon-crm-marques.sql déjà exécutés
--             (colonnes marqueId + fonction marque_slug + slugs backfillés)
--
-- Règle : pour chaque slug en double, on GARDE la fiche avec le meilleur
--         "score" (collabs×10 + négos×5 + inbounds + missions + contacts + gifts),
--         puis la plus ancienne en cas d'égalité. Toutes les autres sont absorbées.
--
-- Exemple : slug "nike" (9 fiches) → 1 fiche Nike, 8 supprimées.
-- =============================================================================

BEGIN;

-- 1) Cartographie source → fiche à garder
CREATE TEMP TABLE marque_merge_map (
    source_id TEXT PRIMARY KEY,
    keeper_id TEXT NOT NULL,
    slug TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO marque_merge_map (source_id, keeper_id, slug)
WITH scored AS (
    SELECT
        m.id,
        m.slug,
        m."createdAt",
        COALESCE(c.n, 0) * 10
        + COALESCE(n.n, 0) * 5
        + COALESCE(io.n, 0)
        + COALESCE(cm.n, 0)
        + COALESCE(mc.n, 0)
        + COALESCE(g.n, 0) AS score
    FROM "marques" m
    LEFT JOIN (SELECT "marqueId", COUNT(*)::int n FROM "collaborations" GROUP BY "marqueId") c ON c."marqueId" = m.id
    LEFT JOIN (SELECT "marqueId", COUNT(*)::int n FROM "negociations" GROUP BY "marqueId") n ON n."marqueId" = m.id
    LEFT JOIN (SELECT "marqueId", COUNT(*)::int n FROM "inbound_opportunities" GROUP BY "marqueId") io ON io."marqueId" = m.id
    LEFT JOIN (SELECT "marqueId", COUNT(*)::int n FROM "contact_missions" GROUP BY "marqueId") cm ON cm."marqueId" = m.id
    LEFT JOIN (SELECT "marqueId", COUNT(*)::int n FROM "marque_contacts" GROUP BY "marqueId") mc ON mc."marqueId" = m.id
    LEFT JOIN (SELECT "marqueId", COUNT(*)::int n FROM "demandes_gift" GROUP BY "marqueId") g ON g."marqueId" = m.id
    WHERE m.slug IS NOT NULL AND m.slug <> ''
),
ranked AS (
    SELECT
        id,
        slug,
        ROW_NUMBER() OVER (PARTITION BY slug ORDER BY score DESC, "createdAt" ASC) AS rn
    FROM scored
),
keepers AS (
    SELECT slug, id AS keeper_id FROM ranked WHERE rn = 1
)
SELECT r.id AS source_id, k.keeper_id, r.slug
FROM ranked r
JOIN keepers k ON k.slug = r.slug
WHERE r.rn > 1;

-- Aperçu avant fusion (optionnel — commente si tu veux aller direct)
SELECT slug, COUNT(*) AS fiches_a_fusionner
FROM marque_merge_map
GROUP BY slug
ORDER BY fiches_a_fusionner DESC, slug;

-- 2) Déplacer toutes les relations vers la fiche gardée
UPDATE "marque_contacts" t
SET "marqueId" = m.keeper_id
FROM marque_merge_map m
WHERE t."marqueId" = m.source_id;

UPDATE "collaborations" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;
UPDATE "negociations" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;
UPDATE "prospections" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;
UPDATE "demandes_gift" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Quote') THEN
        EXECUTE $q$
            UPDATE "Quote" t SET "marqueId" = m.keeper_id
            FROM marque_merge_map m WHERE t."marqueId" = m.source_id
        $q$;
    END IF;
END $$;

UPDATE "inbound_opportunities" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;
UPDATE "contact_missions" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;
UPDATE "OpportuniteMarque" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;
UPDATE "DemandeEntrante" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;
UPDATE "notifications" t SET "marqueId" = m.keeper_id FROM marque_merge_map m WHERE t."marqueId" = m.source_id;

-- 3) Alias (si table existe) : rattacher à la cible puis CASCADE supprimera les alias des sources
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marque_aliases') THEN
        UPDATE "marque_aliases" t
        SET "marqueId" = m.keeper_id
        FROM marque_merge_map m
        WHERE t."marqueId" = m.source_id
          AND NOT EXISTS (
              SELECT 1 FROM "marque_aliases" x
              WHERE x."marqueId" = m.keeper_id AND x.slug = t.slug
          );
        DELETE FROM "marque_aliases" t
        USING marque_merge_map m
        WHERE t."marqueId" = m.source_id;
    END IF;
END $$;

-- 4) Supprimer les fiches doublons (vides de FK)
DELETE FROM "marques" m
USING marque_merge_map map
WHERE m.id = map.source_id;

COMMIT;

-- =============================================================================
-- VÉRIFICATION — doit retourner 0 ligne
-- =============================================================================
SELECT slug, COUNT(*) AS n_fiches, string_agg(nom, ' | ') AS noms
FROM "marques"
WHERE slug IS NOT NULL AND slug <> ''
GROUP BY slug
HAVING COUNT(*) > 1
ORDER BY n_fiches DESC, slug;

-- Si vide → tu peux poser l'UNIQUE :
-- ALTER TABLE "marques" ALTER COLUMN "slug" SET NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS "marques_slug_key" ON "marques"("slug");
