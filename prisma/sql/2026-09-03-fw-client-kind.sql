-- Maisons vs agences presse Fashion Week.

ALTER TABLE "fw_clients" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'MAISON';
CREATE INDEX IF NOT EXISTS "fw_clients_kind_idx" ON "fw_clients"("kind");
