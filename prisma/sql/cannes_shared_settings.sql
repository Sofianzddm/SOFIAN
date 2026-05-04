-- Neon / Postgres: persistance partagée des préférences Cannes 2026
CREATE TABLE IF NOT EXISTS "cannes_shared_settings" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_cannes_shared_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cannes_shared_settings_set_updated_at ON "cannes_shared_settings";
CREATE TRIGGER cannes_shared_settings_set_updated_at
BEFORE UPDATE ON "cannes_shared_settings"
FOR EACH ROW
EXECUTE FUNCTION set_cannes_shared_settings_updated_at();
