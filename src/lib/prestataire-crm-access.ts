import { canAccessProjetsOutreach } from "@/lib/projets-outreach";

export function canAccessPrestataireCrm(role: string | undefined | null): boolean {
  return canAccessProjetsOutreach(role);
}

export function canWritePrestataireCrm(role: string | undefined | null): boolean {
  return (
    role === "ADMIN" ||
    role === "STRATEGY_PLANNER" ||
    role === "HEAD_OF" ||
    role === "HEAD_OF_SALES" ||
    role === "TM" ||
    role === "CM"
  );
}
