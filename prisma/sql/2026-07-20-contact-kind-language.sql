-- Qualification des contacts entrants : agence vs marque en direct + langue.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Sur Negociation (obligatoire à la saisie côté app) et InboundOpportunity
-- (qualification manuelle optionnelle sur la fiche) : le pont outreach route
-- un contact "AGENCE" vers la Prospection Agences (agence créée à la volée si
-- inconnue) — jamais d'agence dans Outreach Clients — et applique la langue
-- du contact (fr/en) au cycle.

ALTER TABLE "negociations"
  ADD COLUMN IF NOT EXISTS "contactKind" TEXT NOT NULL DEFAULT 'MARQUE',
  ADD COLUMN IF NOT EXISTS "contactAgence" TEXT,
  ADD COLUMN IF NOT EXISTS "contactLanguage" TEXT NOT NULL DEFAULT 'fr';

ALTER TABLE "inbound_opportunities"
  ADD COLUMN IF NOT EXISTS "contactKind" TEXT,
  ADD COLUMN IF NOT EXISTS "contactAgence" TEXT,
  ADD COLUMN IF NOT EXISTS "contactLanguage" TEXT NOT NULL DEFAULT 'fr';

-- Collabs créées en direct (sans négo) : qualification du contact billing +
-- pont outreach propre (les collabs issues d'une négo passent par la négo).
ALTER TABLE "collaborations"
  ADD COLUMN IF NOT EXISTS "contactKind" TEXT,
  ADD COLUMN IF NOT EXISTS "contactAgence" TEXT,
  ADD COLUMN IF NOT EXISTS "contactLanguage" TEXT NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS "outreachBridgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "outreachTargetRef" TEXT;
