import { canSeeVisibility } from "./capabilities";
import type { DcRole, DcVisibilityScope } from "./constants";

const SALES_DOMAINS = new Set([
  "SALES",
  "PRICING",
  "COMMERCIAL_GESTURE",
  "RIGHTS",
  "CRM",
  "CAMPAIGN",
]);

export function canViewRequest(opts: {
  role: DcRole;
  requesterId: string;
  userId: string;
  scope: DcVisibilityScope;
  domain: string;
}): boolean {
  if (opts.role === "CEO") return true;
  if (opts.requesterId === opts.userId) return true;
  if (!canSeeVisibility(opts.role, opts.scope)) return false;
  if (opts.role === "HEAD_OF_SALES") {
    if (opts.scope === "SALES") return true;
    if (opts.scope === "ALL_DECISION_CENTER_USERS" && SALES_DOMAINS.has(opts.domain)) {
      return true;
    }
    return false;
  }
  if (opts.role === "EXECUTIVE_ASSISTANT") {
    return opts.scope !== "CEO_ONLY";
  }
  return false;
}

export function myRightsRoles(role: DcRole): DcRole[] {
  if (role === "CEO") return ["CEO"];
  if (role === "EXECUTIVE_ASSISTANT") {
    return ["EXECUTIVE_ASSISTANT", "FINANCE", "HEAD"];
  }
  if (role === "HEAD_OF_SALES") return ["HEAD_OF_SALES"];
  return [role];
}
