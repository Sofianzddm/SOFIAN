-- Rapprochement bancaire N↔N : une transaction Qonto peut être allouée
-- à plusieurs factures (chacune avec son montant) et une facture peut être
-- réglée par plusieurs transactions (paiements partiels / fractionnés).
CREATE TABLE "transaction_document_matches" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "modePaiement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "transaction_document_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transaction_document_matches_transactionId_documentId_key"
    ON "transaction_document_matches"("transactionId", "documentId");
CREATE INDEX "transaction_document_matches_transactionId_idx"
    ON "transaction_document_matches"("transactionId");
CREATE INDEX "transaction_document_matches_documentId_idx"
    ON "transaction_document_matches"("documentId");

ALTER TABLE "transaction_document_matches"
    ADD CONSTRAINT "transaction_document_matches_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "transactions_qonto"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transaction_document_matches"
    ADD CONSTRAINT "transaction_document_matches_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill : transformer chaque association legacy (documentId non null) en match
-- de montant = montant de la transaction (= comportement actuel).
INSERT INTO "transaction_document_matches"
    ("id", "transactionId", "documentId", "montant", "createdAt")
SELECT
    'tdm' || substring(md5(random()::text || t."id") FROM 1 FOR 22),
    t."id",
    t."documentId",
    t."montant",
    t."createdAt"
FROM "transactions_qonto" t
WHERE t."documentId" IS NOT NULL;
