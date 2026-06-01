-- =============================================================================
-- GLOW UP — CRM Marques unifié (à exécuter sur Neon SQL Editor)
-- Ordre : 1 → 2 → 3 → backfill scripts → 4 (optionnel)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Slug + table d'alias (si pas déjà appliqué)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2) Liens CRM sur les entités métier
-- -----------------------------------------------------------------------------
ALTER TABLE "inbound_opportunities" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "inbound_opportunities_marqueId_idx"
    ON "inbound_opportunities"("marqueId");
DO $$ BEGIN
    ALTER TABLE "inbound_opportunities"
        ADD CONSTRAINT "inbound_opportunities_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "contact_missions" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "contact_missions_marqueId_idx" ON "contact_missions"("marqueId");
DO $$ BEGIN
    ALTER TABLE "contact_missions"
        ADD CONSTRAINT "contact_missions_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OpportuniteMarque" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "OpportuniteMarque_marqueId_idx" ON "OpportuniteMarque"("marqueId");
DO $$ BEGIN
    ALTER TABLE "OpportuniteMarque"
        ADD CONSTRAINT "OpportuniteMarque_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "DemandeEntrante" ADD COLUMN IF NOT EXISTS "marqueId" TEXT;
CREATE INDEX IF NOT EXISTS "DemandeEntrante_marqueId_idx" ON "DemandeEntrante"("marqueId");
DO $$ BEGIN
    ALTER TABLE "DemandeEntrante"
        ADD CONSTRAINT "DemandeEntrante_marqueId_fkey"
        FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Backfill slug (équivalent simplifié — préférer le script TS pour la prod)
--    pnpm tsx prisma/scripts/backfill-marque-slugs.ts
-- -----------------------------------------------------------------------------
-- UPDATE "marques" SET "slug" = lower(regexp_replace(
--   translate("nom",
--     'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ',
--     'aaaaaaeeeeiiiiooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYYNC'),
--   '[^a-z0-9]+', '', 'g'))
-- WHERE "slug" IS NULL;

-- -----------------------------------------------------------------------------
-- 4) UNIQUE sur slug — UNIQUEMENT après dédoublonnage (script + fusion UI)
--    pnpm tsx prisma/scripts/backfill-marque-slugs.ts  (voir doublons)
--    puis fusionner les doublons via /marques/[id] ou merge API
-- -----------------------------------------------------------------------------
-- ALTER TABLE "marques" ALTER COLUMN "slug" SET NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS "marques_slug_key" ON "marques"("slug");

-- -----------------------------------------------------------------------------
-- Vérification rapide
-- -----------------------------------------------------------------------------
-- SELECT slug, COUNT(*) FROM marques WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1;
-- SELECT COUNT(*) FROM inbound_opportunities WHERE "marqueId" IS NULL AND "extractedBrand" IS NOT NULL;
