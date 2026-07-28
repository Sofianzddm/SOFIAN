-- Ajoute la colonne langueDocument sur les documents pour permettre des devis/factures en anglais
ALTER TABLE "documents" ADD COLUMN "langueDocument" TEXT NOT NULL DEFAULT 'fr';
