-- Langue du client Fashion Week (mails + relance auto).

ALTER TABLE "fw_clients" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
