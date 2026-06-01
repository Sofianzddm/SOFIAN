-- À exécuter UNIQUEMENT après backfill-marque-slugs.ts et fusion des doublons restants.
-- Rend slug obligatoire et unique (contrainte CRM finale).

UPDATE "marques" SET "slug" = LOWER(REGEXP_REPLACE(
  TRANSLATE("nom", 'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ', 'aaaaaaeeeeiiiiooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYYNC'),
  '[^a-z0-9]+', '', 'g'
))
WHERE "slug" IS NULL OR "slug" = '';

-- Ne pas poser l'UNIQUE si des doublons subsistent (la migration échouera = signal).
ALTER TABLE "marques" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "marques_slug_key" ON "marques"("slug");
