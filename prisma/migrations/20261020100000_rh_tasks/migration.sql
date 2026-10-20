-- CreateEnum
CREATE TYPE "RhTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RhTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "rh_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RhTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "RhTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_task_attachments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_task_events" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rh_tasks_assigneeId_status_idx" ON "rh_tasks"("assigneeId", "status");
CREATE INDEX "rh_tasks_creatorId_idx" ON "rh_tasks"("creatorId");
CREATE INDEX "rh_tasks_dueAt_idx" ON "rh_tasks"("dueAt");
CREATE INDEX "rh_tasks_status_priority_idx" ON "rh_tasks"("status", "priority");
CREATE INDEX "rh_tasks_archivedAt_idx" ON "rh_tasks"("archivedAt");
CREATE INDEX "rh_task_comments_taskId_createdAt_idx" ON "rh_task_comments"("taskId", "createdAt");
CREATE INDEX "rh_task_comments_authorId_idx" ON "rh_task_comments"("authorId");
CREATE INDEX "rh_task_attachments_taskId_idx" ON "rh_task_attachments"("taskId");
CREATE INDEX "rh_task_attachments_uploaderId_idx" ON "rh_task_attachments"("uploaderId");
CREATE INDEX "rh_task_events_taskId_createdAt_idx" ON "rh_task_events"("taskId", "createdAt");
CREATE INDEX "rh_task_events_actorId_idx" ON "rh_task_events"("actorId");

-- AddForeignKey
ALTER TABLE "rh_tasks" ADD CONSTRAINT "rh_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "rh_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh_tasks" ADD CONSTRAINT "rh_tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "rh_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh_task_comments" ADD CONSTRAINT "rh_task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "rh_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh_task_comments" ADD CONSTRAINT "rh_task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "rh_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh_task_attachments" ADD CONSTRAINT "rh_task_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "rh_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh_task_attachments" ADD CONSTRAINT "rh_task_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "rh_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh_task_events" ADD CONSTRAINT "rh_task_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "rh_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh_task_events" ADD CONSTRAINT "rh_task_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "rh_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
