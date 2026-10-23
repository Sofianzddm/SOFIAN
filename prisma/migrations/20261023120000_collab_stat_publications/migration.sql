-- CreateTable
CREATE TABLE "collab_stat_publications" (
    "id" TEXT NOT NULL,
    "collaborationId" TEXT NOT NULL,
    "typeContenu" TEXT NOT NULL,
    "label" TEXT,
    "urlPublication" TEXT,
    "datePublication" TIMESTAMP(3),
    "vues" INTEGER,
    "likes" INTEGER,
    "commentaires" INTEGER,
    "partages" INTEGER,
    "saves" INTEGER,
    "notes" TEXT,
    "saisiParId" TEXT,
    "saisiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collab_stat_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collab_stat_screenshots" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collab_stat_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collab_stat_publications_collaborationId_idx" ON "collab_stat_publications"("collaborationId");

-- CreateIndex
CREATE INDEX "collab_stat_publications_saisiParId_idx" ON "collab_stat_publications"("saisiParId");

-- CreateIndex
CREATE INDEX "collab_stat_screenshots_publicationId_idx" ON "collab_stat_screenshots"("publicationId");

-- AddForeignKey
ALTER TABLE "collab_stat_publications" ADD CONSTRAINT "collab_stat_publications_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "collaborations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collab_stat_publications" ADD CONSTRAINT "collab_stat_publications_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collab_stat_screenshots" ADD CONSTRAINT "collab_stat_screenshots_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "collab_stat_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
