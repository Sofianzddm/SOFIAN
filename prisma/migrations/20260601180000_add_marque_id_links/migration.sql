-- Liens CRM : rattacher inbounds, missions pipeline, opportunités et demandes entrantes à marques

ALTER TABLE "inbound_opportunities" ADD COLUMN "marqueId" TEXT;
CREATE INDEX "inbound_opportunities_marqueId_idx" ON "inbound_opportunities"("marqueId");
ALTER TABLE "inbound_opportunities"
    ADD CONSTRAINT "inbound_opportunities_marqueId_fkey"
    FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_missions" ADD COLUMN "marqueId" TEXT;
CREATE INDEX "contact_missions_marqueId_idx" ON "contact_missions"("marqueId");
ALTER TABLE "contact_missions"
    ADD CONSTRAINT "contact_missions_marqueId_fkey"
    FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OpportuniteMarque" ADD COLUMN "marqueId" TEXT;
CREATE INDEX "OpportuniteMarque_marqueId_idx" ON "OpportuniteMarque"("marqueId");
ALTER TABLE "OpportuniteMarque"
    ADD CONSTRAINT "OpportuniteMarque_marqueId_fkey"
    FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DemandeEntrante" ADD COLUMN "marqueId" TEXT;
CREATE INDEX "DemandeEntrante_marqueId_idx" ON "DemandeEntrante"("marqueId");
ALTER TABLE "DemandeEntrante"
    ADD CONSTRAINT "DemandeEntrante_marqueId_fkey"
    FOREIGN KEY ("marqueId") REFERENCES "marques"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
