-- Photo de profil salarié
ALTER TABLE "rh_employees" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- Challenges OTP connexion RH sécurisée
CREATE TABLE IF NOT EXISTS "rh_login_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rh_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rh_login_challenges_userId_expiresAt_idx"
  ON "rh_login_challenges"("userId", "expiresAt");
