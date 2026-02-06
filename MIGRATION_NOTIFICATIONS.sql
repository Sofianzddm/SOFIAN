-- Migration pour système de notifications avec validation factures talents
-- Date : 27 Janvier 2026

-- 1. Ajouter les colonnes factureValidee et factureValideeAt à la table collaborations
ALTER TABLE "collaborations" 
ADD COLUMN "factureValidee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "factureValideeAt" TIMESTAMP(3);

-- 2. Ajouter le nouveau type de notification FACTURE_VALIDEE
ALTER TYPE "TypeNotification" ADD VALUE 'FACTURE_VALIDEE';

-- 3. Vérification : Afficher quelques collaborations avec factures
SELECT 
  id, 
  reference, 
  "factureTalentUrl", 
  "factureTalentRecueAt",
  "factureValidee",
  "factureValideeAt",
  statut
FROM "collaborations"
WHERE "factureTalentUrl" IS NOT NULL
LIMIT 5;

-- 4. Vérification : Compter les notifications
SELECT type, COUNT(*) as count
FROM "notifications"
GROUP BY type
ORDER BY count DESC;
