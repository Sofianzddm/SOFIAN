-- Lien dépense bancaire ↔ factures talents déjà uploadées sur les collabs.
-- Un débit Qonto (Defacto, Libeo, virement) peut être justifié par N factures
-- talents sans re-upload : collaborations.depenseId / collab_cycles.depenseId.

ALTER TABLE "collaborations" ADD COLUMN IF NOT EXISTS "depenseId" TEXT;
ALTER TABLE "collab_cycles" ADD COLUMN IF NOT EXISTS "depenseId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collaborations_depenseId_fkey'
  ) THEN
    ALTER TABLE "collaborations"
      ADD CONSTRAINT "collaborations_depenseId_fkey"
      FOREIGN KEY ("depenseId") REFERENCES "depenses"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collab_cycles_depenseId_fkey'
  ) THEN
    ALTER TABLE "collab_cycles"
      ADD CONSTRAINT "collab_cycles_depenseId_fkey"
      FOREIGN KEY ("depenseId") REFERENCES "depenses"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "collaborations_depenseId_idx" ON "collaborations"("depenseId");
CREATE INDEX IF NOT EXISTS "collab_cycles_depenseId_idx" ON "collab_cycles"("depenseId");
