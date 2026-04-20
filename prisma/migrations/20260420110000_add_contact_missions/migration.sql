-- CreateEnum
CREATE TYPE "ContactMissionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ContactMissionStatus" AS ENUM ('READY_FOR_CASTING', 'EMAIL_DRAFTED', 'APPROVED_BY_SALES', 'SENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "contact_missions" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "candidateId" TEXT,
    "creatorName" TEXT NOT NULL,
    "targetBrand" TEXT NOT NULL,
    "targetBrandKey" TEXT NOT NULL,
    "strategyReason" TEXT NOT NULL,
    "recommendedAngle" TEXT,
    "objective" TEXT,
    "dos" TEXT,
    "donts" TEXT,
    "priority" "ContactMissionPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ContactMissionStatus" NOT NULL DEFAULT 'READY_FOR_CASTING',
    "deadlineAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_missions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_missions_campaignId_createdAt_idx" ON "contact_missions"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_missions_targetBrandKey_status_createdAt_idx" ON "contact_missions"("targetBrandKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "contact_missions_candidateId_idx" ON "contact_missions"("candidateId");

-- AddForeignKey
ALTER TABLE "contact_missions" ADD CONSTRAINT "contact_missions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "dinner_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_missions" ADD CONSTRAINT "contact_missions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "dinner_creator_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_missions" ADD CONSTRAINT "contact_missions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
