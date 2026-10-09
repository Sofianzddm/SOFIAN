ALTER TABLE "rh_timesheets" ADD COLUMN IF NOT EXISTS "docusealSubmissionId" TEXT;
ALTER TABLE "rh_timesheets" ADD COLUMN IF NOT EXISTS "docusealSigningUrl" TEXT;
CREATE INDEX IF NOT EXISTS "rh_timesheets_docusealSubmissionId_idx"
  ON "rh_timesheets"("docusealSubmissionId");
