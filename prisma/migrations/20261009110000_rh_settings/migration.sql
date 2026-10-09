-- Paramètres globaux RH (singleton JSON)
CREATE TABLE IF NOT EXISTS "rh_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "rh_settings" ("id", "data")
VALUES ('default', '{}')
ON CONFLICT ("id") DO NOTHING;
