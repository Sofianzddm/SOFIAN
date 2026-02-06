-- ============================================
-- MIGRATION QONTO - RÉCONCILIATION BANCAIRE
-- ============================================

-- Créer la table transactions_qonto
CREATE TABLE "transactions_qonto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qontoId" TEXT NOT NULL UNIQUE,
  "montant" DECIMAL(10,2) NOT NULL,
  "devise" TEXT NOT NULL DEFAULT 'EUR',
  "libelle" TEXT,
  "reference" TEXT,
  "dateTransaction" TIMESTAMP(3) NOT NULL,
  "emetteur" TEXT,
  "emetteurIban" TEXT,
  "statut" TEXT NOT NULL DEFAULT 'PENDING',
  "associe" BOOLEAN NOT NULL DEFAULT false,
  "documentId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transactions_qonto_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Créer les index
CREATE INDEX "transactions_qonto_documentId_idx" ON "transactions_qonto"("documentId");
CREATE INDEX "transactions_qonto_associe_idx" ON "transactions_qonto"("associe");
CREATE INDEX "transactions_qonto_dateTransaction_idx" ON "transactions_qonto"("dateTransaction");
CREATE INDEX "transactions_qonto_statut_idx" ON "transactions_qonto"("statut");
CREATE UNIQUE INDEX "transactions_qonto_qontoId_key" ON "transactions_qonto"("qontoId");

-- Ajouter PAIEMENT_RECU à TypeNotification si pas déjà présent
-- (Il existe déjà normalement, cette ligne est pour mémoire)
-- ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'PAIEMENT_RECU';

-- Migration terminée ✅
