-- AlterTable
ALTER TABLE "talent_prospecting_campaigns"
ADD COLUMN "presentationPdfUrl" TEXT,
ADD COLUMN "presentationFileName" TEXT,
ADD COLUMN "presentationUploadedAt" TIMESTAMP(3);
