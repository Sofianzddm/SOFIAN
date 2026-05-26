-- Idempotent : ajoute la valeur COLLAB_GIFTING à l'enum InboundCategory
ALTER TYPE "InboundCategory" ADD VALUE IF NOT EXISTS 'COLLAB_GIFTING';
