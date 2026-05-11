-- CreateTable
CREATE TABLE "CannesTeamPlanningSlot" (
    "id" TEXT NOT NULL,
    "presenceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannesTeamPlanningSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CannesTeamPlanningSlot_presenceId_startsAt_idx" ON "CannesTeamPlanningSlot"("presenceId", "startsAt");

-- AddForeignKey
ALTER TABLE "CannesTeamPlanningSlot" ADD CONSTRAINT "CannesTeamPlanningSlot_presenceId_fkey" FOREIGN KEY ("presenceId") REFERENCES "CannesPresence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
