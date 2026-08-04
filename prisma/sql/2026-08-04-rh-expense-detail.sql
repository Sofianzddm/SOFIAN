-- Détail note de frais façon Lucca/Cleemy : n°, TVA, commentaire, pris en charge

CREATE SEQUENCE IF NOT EXISTS rh_expense_report_number_seq;

ALTER TABLE "rh_expense_reports"
  ADD COLUMN IF NOT EXISTS "number" INTEGER;

UPDATE "rh_expense_reports"
SET "number" = nextval('rh_expense_report_number_seq')
WHERE "number" IS NULL;

ALTER TABLE "rh_expense_reports"
  ALTER COLUMN "number" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rh_expense_reports_number_key'
  ) THEN
    ALTER TABLE "rh_expense_reports" ADD CONSTRAINT "rh_expense_reports_number_key" UNIQUE ("number");
  END IF;
END $$;

SELECT setval(
  'rh_expense_report_number_seq',
  GREATEST((SELECT COALESCE(MAX("number"), 0) FROM "rh_expense_reports"), 1)
);

ALTER TABLE "rh_expense_lines"
  ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vatAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reimbursedAmount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "comment" TEXT;
