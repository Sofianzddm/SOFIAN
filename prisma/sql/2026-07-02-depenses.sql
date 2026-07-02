-- Module Dépenses (achats / notes de frais).
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- 1. Ajoute la colonne `side` sur transactions_qonto : la sync Qonto importe
--    désormais aussi les débits (dépenses), pas seulement les encaissements.
--    Les lignes existantes sont toutes des crédits (défaut 'credit').
-- 2. Crée la table `depenses` : une sortie d'argent à justifier, avec
--    justificatif (facture fournisseur / reçu photographié) et lien optionnel
--    vers la transaction Qonto correspondante.

ALTER TABLE "transactions_qonto"
  ADD COLUMN IF NOT EXISTS "side" TEXT NOT NULL DEFAULT 'credit';

CREATE INDEX IF NOT EXISTS "transactions_qonto_side_idx"
  ON "transactions_qonto" ("side");

CREATE TABLE IF NOT EXISTS "depenses" (
  "id"               TEXT NOT NULL,
  "transactionId"    TEXT,
  "fournisseur"      TEXT,
  "libelle"          TEXT,
  "categorie"        TEXT,
  "notes"            TEXT,
  "montantTTC"       DECIMAL(10,2) NOT NULL,
  "montantTVA"       DECIMAL(10,2),
  "tauxTVA"          DECIMAL(5,2),
  "devise"           TEXT NOT NULL DEFAULT 'EUR',
  "dateDepense"      TIMESTAMP(3) NOT NULL,
  "justificatifUrl"  TEXT,
  "justificatifNom"  TEXT,
  "justificatifType" TEXT,
  "source"           TEXT NOT NULL DEFAULT 'WEB',
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "depenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "depenses_transactionId_key"
  ON "depenses" ("transactionId");

CREATE INDEX IF NOT EXISTS "depenses_dateDepense_idx"
  ON "depenses" ("dateDepense");

CREATE INDEX IF NOT EXISTS "depenses_categorie_idx"
  ON "depenses" ("categorie");

CREATE INDEX IF NOT EXISTS "depenses_createdById_idx"
  ON "depenses" ("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'depenses_transactionId_fkey'
  ) THEN
    ALTER TABLE "depenses"
      ADD CONSTRAINT "depenses_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "transactions_qonto"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'depenses_createdById_fkey'
  ) THEN
    ALTER TABLE "depenses"
      ADD CONSTRAINT "depenses_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
