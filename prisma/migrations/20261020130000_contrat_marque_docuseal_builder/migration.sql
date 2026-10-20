-- Builder DocuSeal contrat marque (placement champs + envoi multi-signataires).
ALTER TABLE "collaborations" ADD COLUMN IF NOT EXISTS "contratMarqueDocusealTemplateId" INTEGER;
ALTER TABLE "collaborations" ADD COLUMN IF NOT EXISTS "contratMarqueSignataires" JSONB;
ALTER TABLE "collaborations" ADD COLUMN IF NOT EXISTS "contratMarqueSubmissionId" TEXT;
