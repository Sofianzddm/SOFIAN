-- Migration : Module « Confirmations talent » (feature anti « faux go »)
-- Date : 28 Juillet 2026
-- Additive : nouvelle table isolée, aucun impact sur l'existant.

CREATE TABLE IF NOT EXISTS "talent_confirmations" (
  "id"                TEXT NOT NULL,
  "token"             TEXT NOT NULL,
  "talentId"          TEXT NOT NULL,
  "createdById"       TEXT NOT NULL,
  "marque"            TEXT NOT NULL,
  "budgetBrut"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "commissionPercent" DECIMAL(65,30) NOT NULL DEFAULT 20,
  "budgetNet"         DECIMAL(65,30) NOT NULL DEFAULT 0,
  "livrables"         TEXT,
  "dateTournage"      TIMESTAMP(3),
  "datePublication"   TIMESTAMP(3),
  "villeDepart"       TEXT,
  "deplacement"       TEXT,
  "droits"            TEXT,
  "optionUntil"       TIMESTAMP(3),
  "checklist"         JSONB,
  "statut"            TEXT NOT NULL DEFAULT 'EN_ATTENTE',
  "note"              TEXT,
  "decidedAt"         TIMESTAMP(3),
  "sentAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "talent_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "talent_confirmations_token_key" ON "talent_confirmations" ("token");
CREATE INDEX IF NOT EXISTS "talent_confirmations_talentId_idx" ON "talent_confirmations" ("talentId");
CREATE INDEX IF NOT EXISTS "talent_confirmations_createdById_idx" ON "talent_confirmations" ("createdById");
CREATE INDEX IF NOT EXISTS "talent_confirmations_statut_idx" ON "talent_confirmations" ("statut");

-- ── Ajouts : preuve horodatée, suivi « vu », relances email auto ──
-- Idempotent : à exécuter même si la table existait déjà sans ces colonnes.
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "confirmedSnapshot" JSONB;
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3);
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "openCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "talent_confirmations" ADD COLUMN IF NOT EXISTS "reminderCount" INTEGER NOT NULL DEFAULT 0;
