ALTER TABLE "rh_timesheets" ADD COLUMN IF NOT EXISTS "signatureRequestedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "rh_timesheets_status_signatureRequestedAt_idx"
  ON "rh_timesheets"("status", "signatureRequestedAt");
