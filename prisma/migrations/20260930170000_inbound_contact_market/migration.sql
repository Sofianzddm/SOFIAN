-- Marché CRM inbound « Marque en direct » : BOTH (FR+BE) par défaut, ou BENELUX.
ALTER TABLE "inbound_opportunities"
ADD COLUMN IF NOT EXISTS "contactMarket" TEXT NOT NULL DEFAULT 'BOTH';

-- Anciennes lignes « FR » seul → FR+BE (on ne tranche plus France seule).
UPDATE "inbound_opportunities"
SET "contactMarket" = 'BOTH'
WHERE "contactMarket" IS NULL
   OR "contactMarket" = ''
   OR UPPER("contactMarket") = 'FR';
