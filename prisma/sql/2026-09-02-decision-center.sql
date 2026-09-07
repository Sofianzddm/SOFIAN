-- Decision Center / CEO OS — Glow Up
-- Idempotent : peut être relancé sans risque.

ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'DECISION_CENTER';

DO $$ BEGIN
  CREATE TYPE "DcRole" AS ENUM (
    'CEO', 'EXECUTIVE_ASSISTANT', 'HEAD_OF_SALES', 'HEAD_OF_INFLUENCE',
    'TALENT_MANAGER', 'ACCOUNT_MANAGER', 'FINANCE', 'LEGAL', 'PRODUCT',
    'TECH', 'MARKETING', 'HEAD', 'PROJECT_OWNER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcLevel" AS ENUM ('GREEN', 'ORANGE', 'RED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcDomain" AS ENUM (
    'TRAVEL', 'PURCHASE', 'PROJECT_BUDGET', 'VENDOR', 'SAAS', 'SALES',
    'PRICING', 'COMMERCIAL_GESTURE', 'BILLING', 'TALENT_PAYMENT',
    'RECEIVABLES', 'EXPENSE', 'HR', 'RECRUITMENT', 'COMPENSATION',
    'TALENT_ACQUISITION', 'TALENT_MANAGEMENT', 'CAMPAIGN', 'RIGHTS',
    'LEGAL', 'CRM', 'TECH', 'MARKETING', 'EVENTS', 'INSURANCE', 'ACCESS',
    'STRATEGY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcRequestStatus" AS ENUM (
    'DRAFT', 'SUBMITTED', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED',
    'CANCELLED', 'EXECUTED', 'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcVisibilityScope" AS ENUM (
    'ALL_DECISION_CENTER_USERS', 'CEO_OFFICE', 'CEO_ONLY', 'SALES'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcCeoVisibility" AS ENUM ('NONE', 'DIGEST', 'NOTIFY', 'IMMEDIATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcRequestKind" AS ENUM ('DECISION', 'POLICY_PROPOSAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcTaxMode" AS ENUM ('HT', 'TTC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DcSubscriptionStatus" AS ENUM (
    'ACTIVE', 'PENDING_RENEWAL', 'TO_REVIEW', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "dc_memberships" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "DcRole" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "dc_policies" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "domain" "DcDomain" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ownerRole" "DcRole" NOT NULL,
  "executorRole" "DcRole",
  "finalDecisionRole" "DcRole" NOT NULL,
  "level" "DcLevel" NOT NULL,
  "autonomyRule" TEXT NOT NULL,
  "thresholdType" TEXT,
  "thresholdValue" DECIMAL(12, 2),
  "thresholdUnit" TEXT,
  "escalationRule" TEXT NOT NULL,
  "justificationRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "recommendationRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "evidenceRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "ceoVisibility" "DcCeoVisibility" NOT NULL DEFAULT 'NONE',
  "visibilityScope" "DcVisibilityScope" NOT NULL DEFAULT 'ALL_DECISION_CENTER_USERS',
  "keywords" TEXT[] NOT NULL DEFAULT '{}',
  "examples" TEXT[] NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "updatedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "dc_policies_domain_idx" ON "dc_policies"("domain");
CREATE INDEX IF NOT EXISTS "dc_policies_level_idx" ON "dc_policies"("level");
CREATE INDEX IF NOT EXISTS "dc_policies_isActive_idx" ON "dc_policies"("isActive");
CREATE INDEX IF NOT EXISTS "dc_policies_ownerRole_idx" ON "dc_policies"("ownerRole");

CREATE TABLE IF NOT EXISTS "dc_policy_versions" (
  "id" TEXT PRIMARY KEY,
  "policyId" TEXT NOT NULL REFERENCES "dc_policies"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  UNIQUE ("policyId", "version")
);

CREATE INDEX IF NOT EXISTS "dc_policy_versions_policyId_idx" ON "dc_policy_versions"("policyId");

CREATE TABLE IF NOT EXISTS "dc_requests" (
  "id" TEXT PRIMARY KEY,
  "reference" TEXT NOT NULL UNIQUE,
  "kind" "DcRequestKind" NOT NULL DEFAULT 'DECISION',
  "title" TEXT NOT NULL,
  "domain" "DcDomain" NOT NULL,
  "requesterId" TEXT NOT NULL REFERENCES "users"("id"),
  "policyId" TEXT REFERENCES "dc_policies"("id") ON DELETE SET NULL,
  "policySnapshot" JSONB,
  "context" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "optionA" TEXT NOT NULL,
  "optionB" TEXT,
  "optionC" TEXT,
  "recommendation" TEXT NOT NULL,
  "amount" DECIMAL(12, 2),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "amountTaxMode" "DcTaxMode" NOT NULL DEFAULT 'TTC',
  "recurring" BOOLEAN NOT NULL DEFAULT FALSE,
  "riskLevel" "DcRiskLevel" NOT NULL DEFAULT 'MEDIUM',
  "riskTypes" TEXT[] NOT NULL DEFAULT '{}',
  "deadline" TIMESTAMP(3),
  "status" "DcRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "finalDecision" TEXT,
  "finalOption" TEXT,
  "decidedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "decidedAt" TIMESTAMP(3),
  "executionStatus" TEXT,
  "executedAt" TIMESTAMP(3),
  "businessValidatorName" TEXT,
  "businessValidatedAt" TIMESTAMP(3),
  "businessValidatorId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "businessValidationNote" TEXT,
  "attachments" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dc_requests_status_idx" ON "dc_requests"("status");
CREATE INDEX IF NOT EXISTS "dc_requests_domain_idx" ON "dc_requests"("domain");
CREATE INDEX IF NOT EXISTS "dc_requests_requesterId_idx" ON "dc_requests"("requesterId");
CREATE INDEX IF NOT EXISTS "dc_requests_deadline_idx" ON "dc_requests"("deadline");
CREATE INDEX IF NOT EXISTS "dc_requests_createdAt_idx" ON "dc_requests"("createdAt");

CREATE TABLE IF NOT EXISTS "dc_request_comments" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "dc_requests"("id") ON DELETE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dc_request_comments_requestId_idx" ON "dc_request_comments"("requestId");

CREATE TABLE IF NOT EXISTS "dc_audit_logs" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "policyId" TEXT REFERENCES "dc_policies"("id") ON DELETE SET NULL,
  "requestId" TEXT REFERENCES "dc_requests"("id") ON DELETE SET NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dc_audit_logs_createdAt_idx" ON "dc_audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "dc_audit_logs_actorId_idx" ON "dc_audit_logs"("actorId");
CREATE INDEX IF NOT EXISTS "dc_audit_logs_action_idx" ON "dc_audit_logs"("action");

CREATE TABLE IF NOT EXISTS "dc_subscriptions" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "vendor" TEXT NOT NULL,
  "ownerRole" "DcRole" NOT NULL,
  "monthlyCost" DECIMAL(12, 2) NOT NULL,
  "annualCost" DECIMAL(12, 2),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "renewalDate" TIMESTAMP(3),
  "noticePeriodDays" INTEGER,
  "autoRenew" BOOLEAN NOT NULL DEFAULT TRUE,
  "paymentMethodLabel" TEXT,
  "usageStatus" TEXT,
  "status" "DcSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dc_subscriptions_status_idx" ON "dc_subscriptions"("status");
CREATE INDEX IF NOT EXISTS "dc_subscriptions_renewalDate_idx" ON "dc_subscriptions"("renewalDate");

CREATE TABLE IF NOT EXISTS "dc_settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
  "travelThresholdTtc" DECIMAL(12, 2) NOT NULL DEFAULT 200,
  "smallPurchaseThresholdTtc" DECIMAL(12, 2) NOT NULL DEFAULT 100,
  "receivableOrangeDays" INTEGER NOT NULL DEFAULT 45,
  "receivableRedDays" INTEGER NOT NULL DEFAULT 60,
  "saasRenewalAlertDays" INTEGER NOT NULL DEFAULT 60,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT
);

INSERT INTO "dc_settings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;
