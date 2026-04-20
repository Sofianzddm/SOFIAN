-- DropForeignKey
ALTER TABLE "contact_missions" DROP CONSTRAINT "contact_missions_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "contact_missions" DROP CONSTRAINT "contact_missions_candidateId_fkey";

-- DropIndex
DROP INDEX "contact_missions_campaignId_createdAt_idx";

-- DropIndex
DROP INDEX "contact_missions_candidateId_idx";

-- AlterTable
ALTER TABLE "contact_missions"
  DROP COLUMN "campaignId",
  DROP COLUMN "candidateId",
  ADD COLUMN "talentId" TEXT;

-- CreateIndex
CREATE INDEX "contact_missions_talentId_idx" ON "contact_missions"("talentId");

-- AddForeignKey
ALTER TABLE "contact_missions" ADD CONSTRAINT "contact_missions_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
