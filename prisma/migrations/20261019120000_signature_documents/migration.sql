-- Documents entreprise en signature électronique DocuSeal
-- (outil générique type HelloSign / DocuSign : PDF libre + N signataires).

CREATE TABLE IF NOT EXISTS "signature_documents" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "fichierUrl" TEXT NOT NULL,
    "docusealTemplateId" INTEGER NOT NULL,
    "submissionId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "signataires" JSONB NOT NULL,
    "signaturesCompleted" INTEGER NOT NULL DEFAULT 0,
    "signaturesTotal" INTEGER NOT NULL DEFAULT 1,
    "signedDocumentUrl" TEXT,
    "envoyeAt" TIMESTAMP(3),
    "signeAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "signature_documents_submissionId_idx" ON "signature_documents" ("submissionId");
CREATE INDEX IF NOT EXISTS "signature_documents_statut_idx" ON "signature_documents" ("statut");
CREATE INDEX IF NOT EXISTS "signature_documents_createdById_idx" ON "signature_documents" ("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signature_documents_createdById_fkey'
  ) THEN
    ALTER TABLE "signature_documents"
      ADD CONSTRAINT "signature_documents_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
