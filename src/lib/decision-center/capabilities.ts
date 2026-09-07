import type { DcRole, DcVisibilityScope } from "./constants";

export const DC_CAPABILITIES = [
  "view_overview",
  "view_matrix",
  "search_rules",
  "view_my_rights",
  "create_request",
  "prepare_for_ceo",
  "view_own_requests",
  "view_operational_requests",
  "view_sales_requests",
  "view_all_requests",
  "comment",
  "decide_red",
  "approve_reject",
  "request_information",
  "mark_executed",
  "edit_policy",
  "create_policy",
  "publish_policy",
  "deactivate_policy",
  "propose_policy_change",
  "view_audit",
  "view_ceo_dashboard",
  "view_ea_dashboard",
  "view_sales_dashboard",
  "view_digest",
  "prepare_digest",
  "admin_roles",
  "manage_subscriptions",
  "view_sensitive_hr",
  "view_sensitive_legal",
  "view_compensation",
  "abandon_receivable",
  "take_hr_sanction",
] as const;

export type DcCapability = (typeof DC_CAPABILITIES)[number];

const CEO_CAPS: readonly DcCapability[] = DC_CAPABILITIES;

const EA_CAPS: readonly DcCapability[] = [
  "view_overview",
  "view_matrix",
  "search_rules",
  "view_my_rights",
  "create_request",
  "prepare_for_ceo",
  "view_own_requests",
  "view_operational_requests",
  "comment",
  "mark_executed",
  "propose_policy_change",
  "view_ea_dashboard",
  "view_digest",
  "prepare_digest",
  "manage_subscriptions",
];

const HOS_CAPS: readonly DcCapability[] = [
  "view_overview",
  "view_matrix",
  "search_rules",
  "view_my_rights",
  "create_request",
  "view_own_requests",
  "view_sales_requests",
  "comment",
  "view_sales_dashboard",
];

const ROLE_CAPS: Record<DcRole, readonly DcCapability[]> = {
  CEO: CEO_CAPS,
  EXECUTIVE_ASSISTANT: EA_CAPS,
  HEAD_OF_SALES: HOS_CAPS,
  HEAD_OF_INFLUENCE: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  TALENT_MANAGER: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  ACCOUNT_MANAGER: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  FINANCE: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  LEGAL: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  PRODUCT: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  TECH: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  MARKETING: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  HEAD: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
  PROJECT_OWNER: ["view_overview", "view_matrix", "search_rules", "view_my_rights"],
};

export function capabilitiesForRole(role: DcRole): readonly DcCapability[] {
  return ROLE_CAPS[role] ?? [];
}

export function hasCapability(
  role: DcRole,
  capability: DcCapability
): boolean {
  return capabilitiesForRole(role).includes(capability);
}

export function canSeeVisibility(
  role: DcRole,
  scope: DcVisibilityScope
): boolean {
  if (role === "CEO") return true;
  if (scope === "ALL_DECISION_CENTER_USERS") return true;
  if (scope === "CEO_ONLY") return false;
  if (scope === "CEO_OFFICE") return role === "EXECUTIVE_ASSISTANT";
  if (scope === "SALES") {
    return role === "HEAD_OF_SALES" || role === "EXECUTIVE_ASSISTANT";
  }
  return false;
}

export function canDecideRed(role: DcRole): boolean {
  return hasCapability(role, "decide_red");
}

export function canAdministerPolicies(role: DcRole): boolean {
  return hasCapability(role, "edit_policy");
}

export function canAccessAdmin(role: DcRole): boolean {
  return (
    hasCapability(role, "edit_policy") || hasCapability(role, "admin_roles")
  );
}
