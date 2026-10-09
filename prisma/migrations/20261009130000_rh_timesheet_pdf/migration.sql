ALTER TABLE "rh_timesheets" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT;
ALTER TABLE "rh_timesheets" ADD COLUMN IF NOT EXISTS "signedPdfUrl" TEXT;
ALTER TABLE "rh_timesheets" ADD COLUMN IF NOT EXISTS "signatureName" TEXT;
