-- ============================================================
-- Marque slug (clé canonique de déduplication) + table d'alias
-- ============================================================
-- Étape 1/2 (non-cassante) : on ajoute slug en NULLABLE.
-- Le backfill est fait par prisma/scripts/backfill-marque-slugs.ts.
-- L'index UNIQUE sera ajouté dans une migration ultérieure
-- (20260602..._enforce_marque_slug_unique) après vérification
-- qu'aucun doublon ne subsiste.
-- ============================================================

ALTER TABLE "marques" ADD COLUMN "slug" TEXT;

CREATE INDEX "marques_slug_idx" ON "marques"("slug");

-- ============================================================
-- Table d'alias : chaque variante d'écriture rencontrée d'un nom
-- de marque est mémorisée, ce qui rend le résolveur "apprenant".
-- ============================================================
CREATE TABLE "marque_aliases" (
    "id" TEXT NOT NULL,
    "marqueId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marque_aliases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marque_aliases_slug_idx" ON "marque_aliases"("slug");
CREATE INDEX "marque_aliases_marqueId_idx" ON "marque_aliases"("marqueId");
CREATE UNIQUE INDEX "marque_aliases_slug_marqueId_key" ON "marque_aliases"("slug", "marqueId");

ALTER TABLE "marque_aliases"
    ADD CONSTRAINT "marque_aliases_marqueId_fkey"
    FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
