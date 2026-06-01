-- =============================================================================
-- GLOW UP — CRM Marques unifié (Neon SQL Editor)
-- Exécute les blocs 1 → 2 → 3 → 4. Bloc 5 = uniquement après fusion.
-- =============================================================================


-- =============================================================================
-- BLOC 1 — Schéma : slug canonique + table d'alias
-- =============================================================================
ALTER TABLE "marques" ADD COLUMN IF NOT EXISTS "slug" TEXT;
CREATE INDEX IF NOT EXISTS "marques_slug_idx" ON "marques"("slug");

CREATE TABLE IF NOT EXISTS "marque_aliases" (
    "id" TEXT NOT NULL,
    "marqueId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marque_aliases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "marque_aliases_slug_idx" ON "marque_aliases"("slug");
CREATE INDEX IF NOT EXISTS "marque_aliases_marqueId_idx" ON "marque_aliases"("marqueId");
CREATE UNIQUE INDEX IF NOT EXISTS "marque_aliases_slug_marqueId_key"
    ON "marque_aliases"("slug", "marqueId");
DO $$ BEGIN
    ALTER TABLE "marque_aliases"
        ADD CONSTRAINT "marque_aliases_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- BLOC 2 — Schéma : liens CRM (marqueId) sur les entités métier
-- =============================================================================
ALTER TABLE "inbound_opportunities" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "inbound_opportunities_marqueId_idx" ON "inbound_opportunities"("marqueId");
DO $$ BEGIN
    ALTER TABLE "inbound_opportunities"
        ADD CONSTRAINT "inbound_opportunities_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "contact_missions" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "contact_missions_marqueId_idx" ON "contact_missions"("marqueId");
DO $$ BEGIN
    ALTER TABLE "contact_missions"
        ADD CONSTRAINT "contact_missions_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "OpportuniteMarque_marqueId_idx" ON "OpportuniteMarque"("marqueId");
DO $$ BEGIN
    ALTER TABLE "OpportuniteMarque"
        ADD CONSTRAINT "OpportuniteMarque_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "DemandeEntrante" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "DemandeEntrante_marqueId_idx" ON "DemandeEntrante"("marqueId");
DO $$ BEGIN
    ALTER TABLE "DemandeEntrante"
        ADD CONSTRAINT "DemandeEntrante_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- BLOC 3 — Fonction PL/pgSQL `marque_slug()`
-- Équivalent strict du `marqueSlug()` TypeScript (src/lib/marque-resolver.ts).
--   "Nike", "NIKE", "Nike France", "L'Oréal" → "nike", "nike", "nikefrance", "loreal"
-- =============================================================================
CREATE OR REPLACE FUNCTION marque_slug(value TEXT) RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    IF value IS NULL OR length(trim(value)) = 0 THEN
        RETURN '';
    END IF;
    result := lower(trim(value));
    -- Translittération des accents les plus courants (FR/EU)
    result := translate(
        result,
        'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿœšž',
        'aaaaaaaceeeeiiiidnoooooouuuuyyosz'
    );
    -- Supprime tout ce qui n'est pas alphanumérique
    result := regexp_replace(result, '[^a-z0-9]+', '', 'g');
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- =============================================================================
-- BLOC 4 — Backfill complet
-- =============================================================================

-- 4.1 — Calcule le slug pour toutes les marques existantes
UPDATE "marques"
SET "slug" = marque_slug("nom")
WHERE "slug" IS NULL OR "slug" = '';

-- 4.2 — Rattache les inbounds historiques (extractedBrand → marque)
UPDATE "inbound_opportunities" AS i
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE i."marqueId" IS NULL
  AND i."extractedBrand" IS NOT NULL
  AND m."slug" = marque_slug(i."extractedBrand");

-- 4.3 — Rattache les missions du pipeline (targetBrand → marque)
UPDATE "contact_missions" AS c
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE c."marqueId" IS NULL
  AND c."targetBrand" IS NOT NULL
  AND m."slug" = marque_slug(c."targetBrand");

-- 4.4 — Rattache les opportunités (Villa Cannes etc.)
UPDATE "OpportuniteMarque" AS o
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE o."marqueId" IS NULL
  AND o."nomMarque" IS NOT NULL
  AND m."slug" = marque_slug(o."nomMarque");

-- 4.5 — Rattache les demandes entrantes historiques
UPDATE "DemandeEntrante" AS d
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE d."marqueId" IS NULL
  AND d."extractedBrand" IS NOT NULL
  AND m."slug" = marque_slug(d."extractedBrand");

-- 4.6 — Rattache les négociations historiques (nomMarqueSaisi → marque)
UPDATE "negociations" AS n
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE n."marqueId" IS NULL
  AND n."nomMarqueSaisi" IS NOT NULL
  AND m."slug" = marque_slug(n."nomMarqueSaisi");

-- 4.7 — Crée des fiches marque pour les marques mentionnées mais inexistantes
-- (extractedBrand d'un inbound qui ne match aucune marque actuelle)
INSERT INTO "marques" ("id", "nom", "slug", "createdAt", "updatedAt")
SELECT
    'm_' || substr(md5(random()::text || marque_slug(brand)), 1, 24),
    brand,
    marque_slug(brand),
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT TRIM("extractedBrand") AS brand
    FROM "inbound_opportunities"
    WHERE "marqueId" IS NULL
      AND "extractedBrand" IS NOT NULL
      AND length(TRIM("extractedBrand")) > 0
      AND marque_slug("extractedBrand") <> ''
      AND marque_slug("extractedBrand") NOT IN (SELECT "slug" FROM "marques" WHERE "slug" IS NOT NULL)

    UNION

    SELECT DISTINCT TRIM("targetBrand")
    FROM "contact_missions"
    WHERE "marqueId" IS NULL
      AND "targetBrand" IS NOT NULL
      AND length(TRIM("targetBrand")) > 0
      AND marque_slug("targetBrand") <> ''
      AND marque_slug("targetBrand") NOT IN (SELECT "slug" FROM "marques" WHERE "slug" IS NOT NULL)

    UNION

    SELECT DISTINCT TRIM("nomMarque")
    FROM "OpportuniteMarque"
    WHERE "marqueId" IS NULL
      AND "nomMarque" IS NOT NULL
      AND length(TRIM("nomMarque")) > 0
      AND marque_slug("nomMarque") <> ''
      AND marque_slug("nomMarque") NOT IN (SELECT "slug" FROM "marques" WHERE "slug" IS NOT NULL)

    UNION

    SELECT DISTINCT TRIM("nomMarqueSaisi")
    FROM "negociations"
    WHERE "marqueId" IS NULL
      AND "nomMarqueSaisi" IS NOT NULL
      AND length(TRIM("nomMarqueSaisi")) > 0
      AND marque_slug("nomMarqueSaisi") <> ''
      AND marque_slug("nomMarqueSaisi") NOT IN (SELECT "slug" FROM "marques" WHERE "slug" IS NOT NULL)
) AS new_brands
ON CONFLICT DO NOTHING;

-- 4.8 — Re-rattache après création des nouvelles fiches
UPDATE "inbound_opportunities" AS i
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE i."marqueId" IS NULL
  AND i."extractedBrand" IS NOT NULL
  AND m."slug" = marque_slug(i."extractedBrand");

UPDATE "contact_missions" AS c
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE c."marqueId" IS NULL
  AND c."targetBrand" IS NOT NULL
  AND m."slug" = marque_slug(c."targetBrand");

UPDATE "OpportuniteMarque" AS o
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE o."marqueId" IS NULL
  AND o."nomMarque" IS NOT NULL
  AND m."slug" = marque_slug(o."nomMarque");

UPDATE "DemandeEntrante" AS d
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE d."marqueId" IS NULL
  AND d."extractedBrand" IS NOT NULL
  AND m."slug" = marque_slug(d."extractedBrand");

UPDATE "negociations" AS n
SET "marqueId" = m."id"
FROM "marques" AS m
WHERE n."marqueId" IS NULL
  AND n."nomMarqueSaisi" IS NOT NULL
  AND m."slug" = marque_slug(n."nomMarqueSaisi");


-- =============================================================================
-- AUDIT — À exécuter après le BLOC 4 pour vérifier
-- =============================================================================

-- Combien de doublons exacts détectés (même slug) ?
SELECT slug, COUNT(*) AS n_fiches, string_agg(nom, ' | ') AS noms
FROM "marques"
WHERE slug IS NOT NULL AND slug <> ''
GROUP BY slug
HAVING COUNT(*) > 1
ORDER BY n_fiches DESC, slug;

-- Couverture du rattachement
SELECT
  'inbound_opportunities' AS table_name,
  COUNT(*) FILTER (WHERE "marqueId" IS NOT NULL) AS lies,
  COUNT(*) FILTER (WHERE "marqueId" IS NULL AND "extractedBrand" IS NOT NULL) AS non_lies_avec_marque,
  COUNT(*) AS total
FROM "inbound_opportunities"
UNION ALL
SELECT 'contact_missions',
  COUNT(*) FILTER (WHERE "marqueId" IS NOT NULL),
  COUNT(*) FILTER (WHERE "marqueId" IS NULL AND "targetBrand" IS NOT NULL),
  COUNT(*)
FROM "contact_missions"
UNION ALL
SELECT 'OpportuniteMarque',
  COUNT(*) FILTER (WHERE "marqueId" IS NOT NULL),
  COUNT(*) FILTER (WHERE "marqueId" IS NULL AND "nomMarque" IS NOT NULL),
  COUNT(*)
FROM "OpportuniteMarque"
UNION ALL
SELECT 'DemandeEntrante',
  COUNT(*) FILTER (WHERE "marqueId" IS NOT NULL),
  COUNT(*) FILTER (WHERE "marqueId" IS NULL AND "extractedBrand" IS NOT NULL),
  COUNT(*)
FROM "DemandeEntrante"
UNION ALL
SELECT 'negociations',
  COUNT(*) FILTER (WHERE "marqueId" IS NOT NULL),
  COUNT(*) FILTER (WHERE "marqueId" IS NULL AND "nomMarqueSaisi" IS NOT NULL),
  COUNT(*)
FROM "negociations";


-- =============================================================================
-- BLOC 5 — UNIQUE sur slug (UNIQUEMENT après fusion des doublons via /marques/duplicates)
-- =============================================================================
-- Vérifie d'abord que la requête "doublons exacts" ci-dessus est vide.
-- Si oui, exécute :
--
-- ALTER TABLE "marques" ALTER COLUMN "slug" SET NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS "marques_slug_key" ON "marques"("slug");
--
-- À partir de ce moment, la BDD elle-même bloque toute création de doublon.
