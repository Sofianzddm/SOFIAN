-- AlterTable
ALTER TABLE "marques" ADD COLUMN "assignedToId" TEXT;

-- CreateIndex
CREATE INDEX "marques_assignedToId_idx" ON "marques"("assignedToId");

-- AddForeignKey
ALTER TABLE "marques" ADD CONSTRAINT "marques_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
