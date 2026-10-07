-- Performances mensuelles saisies manuellement sur la fiche talent (IG Reels + TikTok).

CREATE TABLE IF NOT EXISTS "talent_performances_mensuelles" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "igMoyenneVuesReels" INTEGER,
    "igMoyenneLikes" INTEGER,
    "igMeilleurReelUrl" TEXT,
    "igMeilleurReelVues" INTEGER,
    "ttMoyenneVues" INTEGER,
    "ttMoyenneLikes" INTEGER,
    "ttMeilleurTiktokUrl" TEXT,
    "ttMeilleurTiktokVues" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_performances_mensuelles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "talent_performances_mensuelles_talentId_annee_mois_key"
  ON "talent_performances_mensuelles"("talentId", "annee", "mois");

CREATE INDEX IF NOT EXISTS "talent_performances_mensuelles_talentId_idx"
  ON "talent_performances_mensuelles"("talentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'talent_performances_mensuelles_talentId_fkey'
  ) THEN
    ALTER TABLE "talent_performances_mensuelles"
      ADD CONSTRAINT "talent_performances_mensuelles_talentId_fkey"
      FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
