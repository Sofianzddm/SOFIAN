import type {
  DinnerCampaignStatus,
  DinnerCandidateSource,
  DinnerCandidateStatus,
  DinnerEventType,
} from "@prisma/client";

export const DINNER_ALLOWED_ROLES = ["STRATEGY_PLANNER", "ADMIN", "HEAD_OF", "HEAD_OF_SALES"] as const;

export function canAccessDinnerStrategy(role: string): boolean {
  return DINNER_ALLOWED_ROLES.includes(role as (typeof DINNER_ALLOWED_ROLES)[number]);
}

export function parseCampaignStatus(value: unknown): DinnerCampaignStatus | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "draft") return "DRAFT";
  if (raw === "in_review") return "IN_REVIEW";
  if (raw === "finalized") return "FINALIZED";
  return null;
}

export function parseCandidateStatus(value: unknown): DinnerCandidateStatus | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "proposed") return "PROPOSED";
  if (raw === "approved") return "APPROVED";
  if (raw === "contacted") return "CONTACTED";
  if (raw === "creator_approved") return "CREATOR_APPROVED";
  if (raw === "rejected") return "REJECTED";
  return null;
}

export function parseCandidateSource(value: unknown): DinnerCandidateSource | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "planner") return "PLANNER";
  if (raw === "client") return "CLIENT";
  return null;
}

export function parseEventType(value: unknown): DinnerEventType | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "created") return "CREATED";
  if (raw === "moved") return "MOVED";
  if (raw === "comment_added") return "COMMENT_ADDED";
  if (raw === "edited") return "EDITED";
  return null;
}

