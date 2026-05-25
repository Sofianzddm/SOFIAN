-- Ajoute la colonne devise (currency) sur les documents pour permettre des factures en plusieurs devises
ALTER TABLE "documents" ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'EUR';
