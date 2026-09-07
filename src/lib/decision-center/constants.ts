/**
 * Decision Center — source de vérité phase 1 (côté client + serveur).
 * Ne pas importer Prisma ici : ce fichier est utilisé par le middleware et la sidebar.
 */

export const DECISION_CENTER_FEATURE_FLAG = "decision_center_v1";

/** Désactiver rapidement : DECISION_CENTER_ENABLED=false */
export function isDecisionCenterEnabled(): boolean {
  return process.env.DECISION_CENTER_ENABLED !== "false";
}

export const DECISION_CENTER_ALLOWED_EMAILS = [
  "s.zeddam@glowupagence.fr",
  "sofian@glowupagence.fr",
  "maud@glowupagence.fr",
  "leyna@glowupagence.fr",
] as const;

export type DcPhase1Email = (typeof DECISION_CENTER_ALLOWED_EMAILS)[number];

export const DC_ROLES = [
  "CEO",
  "EXECUTIVE_ASSISTANT",
  "HEAD_OF_SALES",
  "HEAD_OF_INFLUENCE",
  "TALENT_MANAGER",
  "ACCOUNT_MANAGER",
  "FINANCE",
  "LEGAL",
  "PRODUCT",
  "TECH",
  "MARKETING",
  "HEAD",
  "PROJECT_OWNER",
] as const;

export type DcRole = (typeof DC_ROLES)[number];

export const DC_LEVELS = ["GREEN", "ORANGE", "RED"] as const;
export type DcLevel = (typeof DC_LEVELS)[number];

export const DC_DOMAINS = [
  "TRAVEL",
  "PURCHASE",
  "PROJECT_BUDGET",
  "VENDOR",
  "SAAS",
  "SALES",
  "PRICING",
  "COMMERCIAL_GESTURE",
  "BILLING",
  "TALENT_PAYMENT",
  "RECEIVABLES",
  "EXPENSE",
  "HR",
  "RECRUITMENT",
  "COMPENSATION",
  "TALENT_ACQUISITION",
  "TALENT_MANAGEMENT",
  "CAMPAIGN",
  "RIGHTS",
  "LEGAL",
  "CRM",
  "TECH",
  "MARKETING",
  "EVENTS",
  "INSURANCE",
  "ACCESS",
  "STRATEGY",
] as const;

export type DcDomain = (typeof DC_DOMAINS)[number];

export const DC_REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "NEEDS_INFORMATION",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXECUTED",
  "CLOSED",
] as const;

export type DcRequestStatus = (typeof DC_REQUEST_STATUSES)[number];

export const DC_VISIBILITY_SCOPES = [
  "ALL_DECISION_CENTER_USERS",
  "CEO_OFFICE",
  "CEO_ONLY",
  "SALES",
] as const;

export type DcVisibilityScope = (typeof DC_VISIBILITY_SCOPES)[number];

export const DC_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type DcRiskLevel = (typeof DC_RISK_LEVELS)[number];

export const DC_RISK_TYPES = [
  "FINANCIAL",
  "CLIENT",
  "TALENT",
  "LEGAL",
  "HR",
  "REPUTATION",
  "SECURITY",
  "DATA",
  "OTHER",
] as const;

export type DcRiskType = (typeof DC_RISK_TYPES)[number];

export const DC_CEO_VISIBILITY = ["NONE", "DIGEST", "NOTIFY", "IMMEDIATE"] as const;
export type DcCeoVisibility = (typeof DC_CEO_VISIBILITY)[number];

export const DC_REQUEST_KINDS = ["DECISION", "POLICY_PROPOSAL"] as const;
export type DcRequestKind = (typeof DC_REQUEST_KINDS)[number];

export const PHASE1_EMAIL_TO_ROLE: Record<DcPhase1Email, DcRole> = {
  "s.zeddam@glowupagence.fr": "CEO",
  "sofian@glowupagence.fr": "CEO",
  "maud@glowupagence.fr": "EXECUTIVE_ASSISTANT",
  "leyna@glowupagence.fr": "HEAD_OF_SALES",
};

export function normalizeDcEmail(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

export function isDecisionCenterEmail(email?: string | null): boolean {
  const normalized = normalizeDcEmail(email);
  return (DECISION_CENTER_ALLOWED_EMAILS as readonly string[]).includes(
    normalized
  );
}

export function phase1RoleForEmail(email?: string | null): DcRole | null {
  const normalized = normalizeDcEmail(email);
  if (!isDecisionCenterEmail(normalized)) return null;
  return PHASE1_EMAIL_TO_ROLE[normalized as DcPhase1Email] ?? null;
}

/** Seuils V1 — toute modification doit passer par audit + nouvelle version de règle. */
export const DC_DEFAULT_SETTINGS = {
  defaultCurrency: "EUR",
  travelThresholdTtc: 200,
  smallPurchaseThresholdTtc: 100,
  receivableOrangeDays: 45,
  receivableRedDays: 60,
  saasRenewalAlertDays: 60,
} as const;

export const FINALIZED_REQUEST_STATUSES: readonly DcRequestStatus[] = [
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "CLOSED",
];

export function isFinalizedStatus(status: DcRequestStatus): boolean {
  return (
    status === "APPROVED" ||
    status === "REJECTED" ||
    status === "EXECUTED" ||
    status === "CLOSED"
  );
}

/** Une décision rendue / historisée ne peut jamais être supprimée. */
export function canPhysicallyDeleteRequest(status: DcRequestStatus): boolean {
  void status;
  return false;
}

export const DC_DOMAINS_TUPLE = DC_DOMAINS as unknown as [
  DcDomain,
  ...DcDomain[],
];
export const DC_ROLES_TUPLE = DC_ROLES as unknown as [DcRole, ...DcRole[]];
export const DC_LEVELS_TUPLE = DC_LEVELS as unknown as [DcLevel, ...DcLevel[]];
export const DC_RISK_LEVELS_TUPLE = DC_RISK_LEVELS as unknown as [
  DcRiskLevel,
  ...DcRiskLevel[],
];
export const DC_RISK_TYPES_TUPLE = DC_RISK_TYPES as unknown as [
  DcRiskType,
  ...DcRiskType[],
];
