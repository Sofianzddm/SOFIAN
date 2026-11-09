-- AlterTable
ALTER TABLE "demandes_gift" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedById" TEXT;

-- CreateIndex
CREATE INDEX "demandes_gift_archivedAt_idx" ON "demandes_gift"("archivedAt");

-- AddForeignKey
ALTER TABLE "demandes_gift" ADD CONSTRAINT "demandes_gift_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
