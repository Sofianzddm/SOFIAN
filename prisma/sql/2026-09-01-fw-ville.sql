-- Ville de Fashion Week par client (Paris, New York, Milan…).

ALTER TABLE "fw_clients" ADD COLUMN IF NOT EXISTS "ville" TEXT NOT NULL DEFAULT 'PARIS';
CREATE INDEX IF NOT EXISTS "fw_clients_ville_idx" ON "fw_clients"("ville");
