-- Bounce Gmail : garder le contact dans le cycle, marqué « email incorrect ».
ALTER TABLE "agency_outreach_targets"
  ADD COLUMN IF NOT EXISTS "bouncedAt" TIMESTAMP(3);
