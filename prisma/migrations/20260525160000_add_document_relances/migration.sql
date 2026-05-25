-- Ajoute les colonnes de suivi des relances clients sur les factures
-- 1ère relance : facture en retard (échéance dépassée)
-- 2ème relance : 30 jours après l'échéance
-- 3ème relance : 60 jours après l'échéance (= 90j après émission par défaut)
ALTER TABLE "documents" ADD COLUMN "relance1SentAt" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "relance2SentAt" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "relance3SentAt" TIMESTAMP(3);
