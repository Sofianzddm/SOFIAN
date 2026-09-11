export const PROJETS_OUTREACH_ROLES = [
  "STRATEGY_PLANNER",
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "ADMIN",
] as const;

export type ProjetsOutreachRole = (typeof PROJETS_OUTREACH_ROLES)[number];

export const CAMPAIGN_STATUSES = [
  "BRIEF",
  "BRANDS",
  "DRAFTING",
  "SENDING",
  "ACTIVE",
  "CLOSED",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  BRIEF: "Brief",
  BRANDS: "Marques",
  DRAFTING: "Rédaction",
  SENDING: "Envoi",
  ACTIVE: "Actif",
  CLOSED: "Clos",
};

const STATUS_ORDER: Record<CampaignStatus, number> = {
  BRIEF: 0,
  BRANDS: 1,
  DRAFTING: 2,
  SENDING: 3,
  ACTIVE: 4,
  CLOSED: 5,
};

export function isProjetsOutreachRole(role: string | undefined | null): role is ProjetsOutreachRole {
  return !!role && (PROJETS_OUTREACH_ROLES as readonly string[]).includes(role);
}

export function isValidCampaignStatus(v: string): v is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}

export function canCreateCampaign(role: string | undefined | null): boolean {
  return role === "STRATEGY_PLANNER" || role === "ADMIN";
}

export function canEditBrief(role: string | undefined | null): boolean {
  return role === "STRATEGY_PLANNER" || role === "ADMIN";
}

export function canManageBrands(role: string | undefined | null): boolean {
  return role === "STRATEGY_PLANNER" || role === "ADMIN";
}

export function canDraft(role: string | undefined | null): boolean {
  return role === "CASTING_MANAGER" || role === "ADMIN";
}

export function canSend(role: string | undefined | null): boolean {
  return role === "HEAD_OF_SALES" || role === "ADMIN";
}

export function canTransitionTo(
  role: string | undefined | null,
  from: CampaignStatus,
  to: CampaignStatus
): boolean {
  if (!isValidCampaignStatus(from) || !isValidCampaignStatus(to)) return false;
  if (role === "ADMIN") return true;

  if (to === "CLOSED") {
    return canEditBrief(role) || canSend(role);
  }

  if (STATUS_ORDER[to] !== STATUS_ORDER[from] + 1) return false;

  switch (to) {
    case "BRANDS":
      return canEditBrief(role);
    case "DRAFTING":
      return canManageBrands(role);
    case "SENDING":
      return canDraft(role);
    case "ACTIVE":
      return canSend(role);
    default:
      return false;
  }
}

export const DEFAULT_SENDER_EMAIL = "leyna@glowupagence.fr";

export type CampaignActivityType =
  | "CREATED"
  | "BRIEF_UPDATED"
  | "BRIEF_READY"
  | "BRANDS_ADDED"
  | "READY_FOR_DRAFTING"
  | "READY_FOR_SENDING"
  | "ACTIVATED"
  | "CLOSED"
  | "STATUS_CHANGED"
  | "MARQUE_COMPLETION_REQUESTED"
  | "MARQUE_COMPLETION_RESOLVED";
