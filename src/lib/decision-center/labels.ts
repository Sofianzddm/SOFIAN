import type {
  DcCeoVisibility,
  DcDomain,
  DcLevel,
  DcRequestStatus,
  DcRiskLevel,
  DcRiskType,
  DcRole,
  DcVisibilityScope,
} from "./constants";

export const DC_ROLE_LABELS: Record<DcRole, string> = {
  CEO: "Sofian (CEO)",
  EXECUTIVE_ASSISTANT: "Assistante de direction",
  HEAD_OF_SALES: "Head of Sales",
  HEAD_OF_INFLUENCE: "Head of Influence",
  TALENT_MANAGER: "Talent Manager",
  ACCOUNT_MANAGER: "Account Manager",
  FINANCE: "Comptabilité",
  LEGAL: "Juridique",
  PRODUCT: "Product",
  TECH: "Tech",
  MARKETING: "Marketing",
  HEAD: "Head concerné",
  PROJECT_OWNER: "Project Owner",
};

export const DC_DOMAIN_LABELS: Record<DcDomain, string> = {
  TRAVEL: "Déplacements",
  PURCHASE: "Petits achats",
  PROJECT_BUDGET: "Budget projet",
  VENDOR: "Fournisseurs",
  SAAS: "SaaS / Abonnements",
  SALES: "Sales",
  PRICING: "Pricing / Négociation",
  COMMERCIAL_GESTURE: "Gestes commerciaux",
  BILLING: "Facturation",
  TALENT_PAYMENT: "Paiement talents",
  RECEIVABLES: "Impayés / Recouvrement",
  EXPENSE: "Notes de frais",
  HR: "RH quotidien",
  RECRUITMENT: "Recrutement",
  COMPENSATION: "Rémunérations",
  TALENT_ACQUISITION: "Talent acquisition",
  TALENT_MANAGEMENT: "Talent management",
  CAMPAIGN: "Campagnes",
  RIGHTS: "Rights / Paid media",
  LEGAL: "Juridique",
  CRM: "CRM / HubSpot",
  TECH: "Tech / Application",
  MARKETING: "Marketing / Communication",
  EVENTS: "Événements",
  INSURANCE: "Assurances",
  ACCESS: "Accès / Données",
  STRATEGY: "Stratégie",
};

export const DC_LEVEL_LABELS: Record<DcLevel, string> = {
  GREEN: "Autonome",
  ORANGE: "Encadré",
  RED: "Direction",
};

export const DC_LEVEL_EMOJI: Record<DcLevel, string> = {
  GREEN: "🟢",
  ORANGE: "🟠",
  RED: "🔴",
};

export const DC_STATUS_LABELS: Record<DcRequestStatus, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "À traiter",
  NEEDS_INFORMATION: "Précision demandée",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
  EXECUTED: "Exécutée",
  CLOSED: "Clôturée",
};

export const DC_RISK_LABELS: Record<DcRiskLevel, string> = {
  LOW: "Faible",
  MEDIUM: "Moyen",
  HIGH: "Élevé",
  CRITICAL: "Critique",
};

export const DC_RISK_TYPE_LABELS: Record<DcRiskType, string> = {
  FINANCIAL: "Financier",
  CLIENT: "Client",
  TALENT: "Talent",
  LEGAL: "Juridique",
  HR: "RH",
  REPUTATION: "Réputation",
  SECURITY: "Sécurité",
  DATA: "Données",
  OTHER: "Autre",
};

export const DC_VISIBILITY_LABELS: Record<DcVisibilityScope, string> = {
  ALL_DECISION_CENTER_USERS: "Tous les utilisateurs DC",
  CEO_OFFICE: "CEO Office",
  CEO_ONLY: "CEO uniquement",
  SALES: "Sales",
};

export const DC_CEO_VISIBILITY_LABELS: Record<DcCeoVisibility, string> = {
  NONE: "Aucune",
  DIGEST: "Digest",
  NOTIFY: "Notification",
  IMMEDIATE: "Immédiate",
};

export function roleLabel(role: DcRole): string {
  return DC_ROLE_LABELS[role] ?? role;
}

export function domainLabel(domain: DcDomain): string {
  return DC_DOMAIN_LABELS[domain] ?? domain;
}

export function levelLabel(level: DcLevel): string {
  return `${DC_LEVEL_EMOJI[level]} ${DC_LEVEL_LABELS[level]}`;
}
