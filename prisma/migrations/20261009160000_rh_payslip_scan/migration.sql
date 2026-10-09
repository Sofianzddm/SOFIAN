-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RhPayslipScanStatus" AS ENUM ('PENDING_VERIFY', 'APPLIED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh_payslip_scans" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "matricule" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "rawHeader" TEXT,
    "analyseIA" JSONB,
    "cpAcquis" DOUBLE PRECISION,
    "cpPris" DOUBLE PRECISION,
    "cpSolde" DOUBLE PRECISION,
    "rttAcquis" DOUBLE PRECISION,
    "rttPris" DOUBLE PRECISION,
    "rttSolde" DOUBLE PRECISION,
    "grossSalary" DOUBLE PRECISION,
    "netPay" DOUBLE PRECISION,
    "status" "RhPayslipScanStatus" NOT NULL DEFAULT 'PENDING_VERIFY',
    "ocrVerified" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_payslip_scans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rh_payslip_scans_employeeId_periodYear_periodMonth_key"
  ON "rh_payslip_scans"("employeeId", "periodYear", "periodMonth");
CREATE INDEX IF NOT EXISTS "rh_payslip_scans_periodYear_periodMonth_status_idx"
  ON "rh_payslip_scans"("periodYear", "periodMonth", "status");
CREATE INDEX IF NOT EXISTS "rh_payslip_scans_matricule_idx"
  ON "rh_payslip_scans"("matricule");

DO $$ BEGIN
  ALTER TABLE "rh_payslip_scans"
    ADD CONSTRAINT "rh_payslip_scans_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "rh_employees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
