-- Rapports stats activation : permet d'envoyer a un client (avec mot de passe)
-- les screenshots de stats de un ou plusieurs talents pour une activation donnee.

CREATE TABLE "activation_reports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientAccessToken" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activation_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activation_reports_clientAccessToken_key"
    ON "activation_reports"("clientAccessToken");
CREATE INDEX "activation_reports_createdById_idx"
    ON "activation_reports"("createdById");

ALTER TABLE "activation_reports"
    ADD CONSTRAINT "activation_reports_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "activation_report_talents" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_report_talents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activation_report_talents_reportId_talentId_key"
    ON "activation_report_talents"("reportId", "talentId");
CREATE INDEX "activation_report_talents_reportId_idx"
    ON "activation_report_talents"("reportId");
CREATE INDEX "activation_report_talents_talentId_idx"
    ON "activation_report_talents"("talentId");

ALTER TABLE "activation_report_talents"
    ADD CONSTRAINT "activation_report_talents_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "activation_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activation_report_talents"
    ADD CONSTRAINT "activation_report_talents_talentId_fkey"
    FOREIGN KEY ("talentId") REFERENCES "talents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "activation_report_screenshots" (
    "id" TEXT NOT NULL,
    "reportTalentId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_report_screenshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activation_report_screenshots_reportTalentId_idx"
    ON "activation_report_screenshots"("reportTalentId");

ALTER TABLE "activation_report_screenshots"
    ADD CONSTRAINT "activation_report_screenshots_reportTalentId_fkey"
    FOREIGN KEY ("reportTalentId") REFERENCES "activation_report_talents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
