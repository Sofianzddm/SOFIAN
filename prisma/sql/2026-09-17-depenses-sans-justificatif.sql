-- Acquittement sans ticket : une dépense peut sortir de « à justifier »
-- sans fichier ni factures talents (ex. Libeo suivi ailleurs, abonnement…).
-- À appliquer sur Neon (idempotent).

ALTER TABLE "depenses"
  ADD COLUMN IF NOT EXISTS "sansJustificatif" BOOLEAN NOT NULL DEFAULT false;
