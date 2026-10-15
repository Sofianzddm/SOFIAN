-- CreateTable
CREATE TABLE "user_activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'casting',
    "summary" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "path" TEXT,
    "method" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_activity_logs_userId_createdAt_idx" ON "user_activity_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_activity_logs_createdAt_idx" ON "user_activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "user_activity_logs_action_createdAt_idx" ON "user_activity_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "user_activity_logs_module_createdAt_idx" ON "user_activity_logs"("module", "createdAt");

-- AddForeignKey
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
