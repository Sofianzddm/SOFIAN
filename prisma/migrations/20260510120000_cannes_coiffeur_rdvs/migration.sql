-- CreateTable (étape historique ; remplacée par réservation native dans migration suivante)
CREATE TABLE "cannes_coiffeur_rdvs" (
    "id" TEXT NOT NULL,
    "externalUid" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "attendeeName" TEXT,
    "attendeeEmail" TEXT,
    "eventTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'calcom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cannes_coiffeur_rdvs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cannes_coiffeur_rdvs_externalUid_key" ON "cannes_coiffeur_rdvs"("externalUid");

CREATE INDEX "cannes_coiffeur_rdvs_startsAt_idx" ON "cannes_coiffeur_rdvs"("startsAt");
