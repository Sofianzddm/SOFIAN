-- Multi-sélection marques + partenaires sur les demandes de gift

CREATE TABLE "demande_gift_marques" (
    "demandeGiftId" TEXT NOT NULL,
    "marqueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demande_gift_marques_pkey" PRIMARY KEY ("demandeGiftId","marqueId")
);

CREATE TABLE "demande_gift_partners" (
    "demandeGiftId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demande_gift_partners_pkey" PRIMARY KEY ("demandeGiftId","partnerId")
);

CREATE INDEX "demande_gift_marques_marqueId_idx" ON "demande_gift_marques"("marqueId");
CREATE INDEX "demande_gift_partners_partnerId_idx" ON "demande_gift_partners"("partnerId");

ALTER TABLE "demande_gift_marques" ADD CONSTRAINT "demande_gift_marques_demandeGiftId_fkey" FOREIGN KEY ("demandeGiftId") REFERENCES "demandes_gift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demande_gift_marques" ADD CONSTRAINT "demande_gift_marques_marqueId_fkey" FOREIGN KEY ("marqueId") REFERENCES "marques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demande_gift_partners" ADD CONSTRAINT "demande_gift_partners_demandeGiftId_fkey" FOREIGN KEY ("demandeGiftId") REFERENCES "demandes_gift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demande_gift_partners" ADD CONSTRAINT "demande_gift_partners_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill : reprise de la marque principale existante
INSERT INTO "demande_gift_marques" ("demandeGiftId", "marqueId", "createdAt")
SELECT "id", "marqueId", CURRENT_TIMESTAMP
FROM "demandes_gift"
WHERE "marqueId" IS NOT NULL
ON CONFLICT DO NOTHING;
