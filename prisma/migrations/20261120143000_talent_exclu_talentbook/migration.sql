-- Permet de garder un talent actif dans l'agence sans l'afficher dans le talent book.
ALTER TABLE "talents" ADD COLUMN IF NOT EXISTS "excluTalentbook" BOOLEAN NOT NULL DEFAULT false;

-- Océane Pedrosa : désarchivée, hors talent book.
UPDATE "talents"
SET "isArchived" = false, "excluTalentbook" = true
WHERE "id" = 'cmqpbjx4b0001le04u33wwj2c'
  AND lower("nom") = 'pedrosa';
