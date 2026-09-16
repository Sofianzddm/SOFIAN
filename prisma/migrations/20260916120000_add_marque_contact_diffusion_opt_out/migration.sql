-- Opt-out client liste de diffusion (email conservé, enrôlement bloqué).
ALTER TABLE "marque_contacts" ADD COLUMN IF NOT EXISTS "diffusionOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "marque_contacts" ADD COLUMN IF NOT EXISTS "diffusionOptOutAt" TIMESTAMP(3);
