-- CreateTable
CREATE TABLE "CannesTeamUnavailability" (
    "id" TEXT NOT NULL,
    "presenceId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannesTeamUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CannesTeamUnavailability_presenceId_idx" ON "CannesTeamUnavailability"("presenceId");

-- AddForeignKey
ALTER TABLE "CannesTeamUnavailability" ADD CONSTRAINT "CannesTeamUnavailability_presenceId_fkey" FOREIGN KEY ("presenceId") REFERENCES "CannesPresence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
