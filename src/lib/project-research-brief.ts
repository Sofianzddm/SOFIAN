/**
 * Brief projet passé aux analyses marque / talent (parcours projets-outreach).
 * Même forme que projectBrief / projectBriefs de generate-email.
 */
export type ProjectResearchBrief = {
  talentId?: string | null;
  projectTitle?: string | null;
  projectDescription?: string | null;
  creatorName?: string | null;
  targetBrand?: string | null;
  strategyReason?: string | null;
  recommendedAngle?: string | null;
  objective?: string | null;
  deliverables?: string | null;
  angles?: string | null;
  timeline?: string | null;
  budgetRange?: string | null;
  dos?: string | null;
  donts?: string | null;
};

function line(label: string, value: unknown): string {
  const v = String(value || "").trim();
  return v ? `- ${label} : ${v}` : "";
}

/** Bloc texte brief pour injection dans un prompt IA. */
export function formatProjectBriefForPrompt(
  brief: ProjectResearchBrief,
  index?: number
): string {
  const header =
    typeof index === "number"
      ? `PROJET ${index + 1}${brief.creatorName ? ` — ${String(brief.creatorName).trim()}` : ""}`
      : "BRIEF PROJET";
  return [
    header,
    line("Titre", brief.projectTitle),
    line("Description", brief.projectDescription),
    line("Talent", brief.creatorName),
    line("Marque ciblée", brief.targetBrand),
    line("Raison strategy", brief.strategyReason),
    line("Angle recommandé", brief.recommendedAngle),
    line("Objectif", brief.objective),
    line("Livrables", brief.deliverables),
    line("Angles", brief.angles),
    line("Timeline", brief.timeline),
    line("Budget", brief.budgetRange),
    line("Do's", brief.dos),
    line("Don'ts", brief.donts),
  ]
    .filter(Boolean)
    .join("\n");
}

export function hasUsefulProjectBrief(brief: unknown): brief is ProjectResearchBrief {
  if (!brief || typeof brief !== "object") return false;
  const b = brief as ProjectResearchBrief;
  return Boolean(
    String(b.strategyReason || "").trim() ||
      String(b.objective || "").trim() ||
      String(b.projectTitle || "").trim() ||
      String(b.projectDescription || "").trim() ||
      String(b.deliverables || "").trim() ||
      String(b.creatorName || "").trim() ||
      String(b.recommendedAngle || "").trim()
  );
}

/** Normalise un tableau de briefs depuis le body HTTP. */
export function parseProjectBriefs(raw: unknown): ProjectResearchBrief[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(hasUsefulProjectBrief).slice(0, 8);
}

export function parseProjectBrief(raw: unknown): ProjectResearchBrief | null {
  return hasUsefulProjectBrief(raw) ? raw : null;
}

/** Choisit le brief le plus pertinent pour un talent donné. */
export function pickBriefForTalent(
  talentId: string,
  opts: {
    projectBrief?: ProjectResearchBrief | null;
    projectBriefs?: ProjectResearchBrief[];
  }
): ProjectResearchBrief | null {
  const briefs = opts.projectBriefs || [];
  if (briefs.length > 0) {
    const byId = briefs.find(
      (b) => String(b.talentId || "").trim() === talentId
    );
    if (byId) return byId;
    // Fallback : un seul brief utile, ou le premier.
    if (briefs.length === 1) return briefs[0];
  }
  return opts.projectBrief || null;
}
