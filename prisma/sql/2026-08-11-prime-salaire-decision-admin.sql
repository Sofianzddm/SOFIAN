-- Décision admin sur les primes HoI :
-- tableau corrigé (lignesAdmin / primeCAAdmin) + Excel téléchargeable.
ALTER TABLE "PrimeSalaire"
  ADD COLUMN IF NOT EXISTS "lignesAdmin" JSONB,
  ADD COLUMN IF NOT EXISTS "primeCAAdmin" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "excelUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "excelFileName" TEXT;
