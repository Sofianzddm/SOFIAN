-- Ajoute la possibilité de marquer une transaction Qonto comme "Paiement hors plateforme"
-- (virement perso, autre activité, remboursement, etc.) afin qu'elle n'apparaisse plus dans la
-- liste des transactions à réconcilier avec une facture GlowUp.
ALTER TABLE "transactions_qonto" ADD COLUMN "horsPlateforme" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transactions_qonto" ADD COLUMN "horsPlateformeAt" TIMESTAMP(3);
ALTER TABLE "transactions_qonto" ADD COLUMN "horsPlateformeNote" TEXT;

CREATE INDEX "transactions_qonto_horsPlateforme_idx" ON "transactions_qonto"("horsPlateforme");
