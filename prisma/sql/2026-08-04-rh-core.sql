-- Plateforme RH Glow Up (remplacement Lucca)
-- Idempotent : peut être relancé sans risque.

DO $$ BEGIN
  CREATE TYPE "RhRole" AS ENUM ('COLLAB', 'MANAGER', 'HR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhHealthCover" AS ENUM ('ENROLLED', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhLeaveAccount" AS ENUM ('CP', 'RECUP', 'RTT', 'SS', 'UNPAID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhRequestType" AS ENUM (
    'LEAVE', 'UNPAID_LEAVE', 'REMOTE_EXCEPTION', 'TIMESHEET',
    'EXPENSE', 'PAUSE_AMEND', 'ADDRESS_CHANGE', 'CONTACT_CHANGE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhRequestStatus" AS ENUM (
    'DRAFT', 'PENDING', 'PAUSED', 'APPROVED', 'REFUSED', 'SIGNED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhTimesheetStatus" AS ENUM (
    'DRAFT', 'SUBMITTED', 'PAUSED', 'APPROVED', 'SIGNED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhExpenseStatus" AS ENUM (
    'DRAFT', 'SUBMITTED', 'APPROVED', 'REFUSED', 'PAID'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhDocKind" AS ENUM (
    'CONTRACT', 'AMENDMENT', 'REMOTE_AGREEMENT', 'COMPANY_AGREEMENT',
    'PAYSLIP', 'MUTUELLE', 'INSURANCE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RhDocStatus" AS ENUM (
    'SIGNED', 'TO_SIGN', 'ACTIVE', 'TO_REVIEW', 'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "rh_employees" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "matricule" TEXT NOT NULL UNIQUE,
  "jobTitle" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "managerId" TEXT REFERENCES "rh_employees"("id") ON DELETE SET NULL,
  "hireDate" TIMESTAMP(3) NOT NULL,
  "weeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 35,
  "avatarColor" TEXT NOT NULL DEFAULT '#7C8CF8',
  "remoteAgreement" INTEGER NOT NULL DEFAULT 0,
  "remoteAddressLine1" TEXT,
  "remoteAddressLine2" TEXT,
  "remoteCity" TEXT,
  "remotePostalCode" TEXT,
  "remoteCountry" TEXT DEFAULT 'FR',
  "remoteInsuranceExpiresOn" TIMESTAMP(3),
  "healthCover" "RhHealthCover" NOT NULL DEFAULT 'ENROLLED',
  "grossSalary" DECIMAL(10,2),
  "variableSalary" DECIMAL(10,2),
  "rhRole" "RhRole" NOT NULL DEFAULT 'COLLAB',
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rh_employees_managerId_idx" ON "rh_employees"("managerId");
CREATE INDEX IF NOT EXISTS "rh_employees_rhRole_idx" ON "rh_employees"("rhRole");
CREATE INDEX IF NOT EXISTS "rh_employees_actif_idx" ON "rh_employees"("actif");

CREATE TABLE IF NOT EXISTS "rh_leave_balances" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "accountCode" "RhLeaveAccount" NOT NULL,
  "label" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "accrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taken" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bookable" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expiresOn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "rh_leave_balances_employeeId_accountCode_periodStart_key"
  ON "rh_leave_balances"("employeeId", "accountCode", "periodStart");
CREATE INDEX IF NOT EXISTS "rh_leave_balances_employeeId_idx" ON "rh_leave_balances"("employeeId");

CREATE TABLE IF NOT EXISTS "rh_requests" (
  "id" TEXT PRIMARY KEY,
  "reference" TEXT NOT NULL UNIQUE,
  "type" "RhRequestType" NOT NULL,
  "status" "RhRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "reviewedById" TEXT REFERENCES "rh_employees"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "comment" TEXT,
  "reviewNote" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "days" DOUBLE PRECISION,
  "dateFrom" TIMESTAMP(3),
  "dateTo" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rh_requests_employeeId_status_idx" ON "rh_requests"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "rh_requests_type_status_idx" ON "rh_requests"("type", "status");
CREATE INDEX IF NOT EXISTS "rh_requests_reviewedById_idx" ON "rh_requests"("reviewedById");

CREATE TABLE IF NOT EXISTS "rh_leave_days" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "requestId" TEXT REFERENCES "rh_requests"("id") ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "accountCode" "RhLeaveAccount" NOT NULL,
  "halfDay" BOOLEAN NOT NULL DEFAULT false,
  "half" TEXT,
  "days" DOUBLE PRECISION NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS "rh_leave_days_employeeId_date_half_key"
  ON "rh_leave_days"("employeeId", "date", "half");
CREATE INDEX IF NOT EXISTS "rh_leave_days_employeeId_date_idx" ON "rh_leave_days"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "rh_leave_days_accountCode_date_idx" ON "rh_leave_days"("accountCode", "date");
CREATE INDEX IF NOT EXISTS "rh_leave_days_requestId_idx" ON "rh_leave_days"("requestId");

CREATE TABLE IF NOT EXISTS "rh_remote_declarations" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "isoYear" INTEGER NOT NULL,
  "isoWeek" INTEGER NOT NULL,
  "weekStart" DATE NOT NULL,
  "weekEnd" DATE NOT NULL,
  "declaredDates" DATE[] NOT NULL DEFAULT '{}',
  "compensationWeek" INTEGER,
  "exceptional" BOOLEAN NOT NULL DEFAULT false,
  "exceptionRequestId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "rh_remote_declarations_employeeId_isoYear_isoWeek_key"
  ON "rh_remote_declarations"("employeeId", "isoYear", "isoWeek");
CREATE INDEX IF NOT EXISTS "rh_remote_declarations_employeeId_idx" ON "rh_remote_declarations"("employeeId");

CREATE TABLE IF NOT EXISTS "rh_timesheets" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "requestId" TEXT UNIQUE REFERENCES "rh_requests"("id") ON DELETE SET NULL,
  "isoYear" INTEGER NOT NULL,
  "isoWeek" INTEGER NOT NULL,
  "weekStart" DATE NOT NULL,
  "weekEnd" DATE NOT NULL,
  "status" "RhTimesheetStatus" NOT NULL DEFAULT 'DRAFT',
  "overtimeNote" TEXT,
  "pauseNote" TEXT,
  "pauseReply" TEXT,
  "totalMinutes" INTEGER NOT NULL DEFAULT 0,
  "ot25Minutes" INTEGER NOT NULL DEFAULT 0,
  "ot50Minutes" INTEGER NOT NULL DEFAULT 0,
  "signedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "rh_timesheets_employeeId_isoYear_isoWeek_key"
  ON "rh_timesheets"("employeeId", "isoYear", "isoWeek");
CREATE INDEX IF NOT EXISTS "rh_timesheets_employeeId_status_idx" ON "rh_timesheets"("employeeId", "status");

CREATE TABLE IF NOT EXISTS "rh_timesheet_days" (
  "id" TEXT PRIMARY KEY,
  "timesheetId" TEXT NOT NULL REFERENCES "rh_timesheets"("id") ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "slots" JSONB NOT NULL DEFAULT '[]',
  "breakMinutes" INTEGER NOT NULL DEFAULT 60,
  "totalMinutes" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "rh_timesheet_days_timesheetId_date_key"
  ON "rh_timesheet_days"("timesheetId", "date");
CREATE INDEX IF NOT EXISTS "rh_timesheet_days_timesheetId_idx" ON "rh_timesheet_days"("timesheetId");

CREATE SEQUENCE IF NOT EXISTS rh_expense_report_number_seq;

CREATE TABLE IF NOT EXISTS "rh_expense_reports" (
  "id" TEXT PRIMARY KEY,
  "number" INTEGER NOT NULL UNIQUE DEFAULT nextval('rh_expense_report_number_seq'),
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "requestId" TEXT UNIQUE REFERENCES "rh_requests"("id") ON DELETE SET NULL,
  "label" TEXT NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "status" "RhExpenseStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rh_expense_reports_employeeId_status_idx"
  ON "rh_expense_reports"("employeeId", "status");

CREATE TABLE IF NOT EXISTS "rh_expense_lines" (
  "id" TEXT PRIMARY KEY,
  "reportId" TEXT NOT NULL REFERENCES "rh_expense_reports"("id") ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "vatAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "reimbursedAmount" DECIMAL(10,2),
  "receiptUrl" TEXT,
  "receiptName" TEXT,
  "missingReceipt" BOOLEAN NOT NULL DEFAULT false,
  "comment" TEXT,
  "isCompanyMeal" BOOLEAN NOT NULL DEFAULT false,
  "isTravelMeal" BOOLEAN NOT NULL DEFAULT false,
  "isMileage" BOOLEAN NOT NULL DEFAULT false,
  "km" DOUBLE PRECISION,
  "fiscalHp" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rh_expense_lines_reportId_idx" ON "rh_expense_lines"("reportId");

CREATE TABLE IF NOT EXISTS "rh_vehicles" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL UNIQUE REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "label" TEXT,
  "fiscalHorsepower" INTEGER NOT NULL DEFAULT 5,
  "yearKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "carteGriseExpiresOn" TIMESTAMP(3),
  "insuranceExpiresOn" TIMESTAMP(3),
  "licenseExpiresOn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "rh_documents" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "kind" "RhDocKind" NOT NULL,
  "title" TEXT NOT NULL,
  "status" "RhDocStatus" NOT NULL DEFAULT 'TO_REVIEW',
  "url" TEXT,
  "period" TEXT,
  "expiresOn" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rh_documents_employeeId_idx" ON "rh_documents"("employeeId");

CREATE TABLE IF NOT EXISTS "rh_contact_changes" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "rh_employees"("id") ON DELETE CASCADE,
  "requestId" TEXT UNIQUE REFERENCES "rh_requests"("id") ON DELETE SET NULL,
  "status" "RhRequestStatus" NOT NULL DEFAULT 'PENDING',
  "proposed" JSONB NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rh_contact_changes_employeeId_status_idx"
  ON "rh_contact_changes"("employeeId", "status");

CREATE TABLE IF NOT EXISTS "rh_audit_logs" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT REFERENCES "rh_employees"("id") ON DELETE SET NULL,
  "targetId" TEXT REFERENCES "rh_employees"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rh_audit_logs_createdAt_idx" ON "rh_audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "rh_audit_logs_actorId_idx" ON "rh_audit_logs"("actorId");
