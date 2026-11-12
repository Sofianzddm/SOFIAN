import { sanitizePresentationExcerpt } from "@/lib/campaign-presentation-text";

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
  /** Contexte ops libre (wizard) — le mail doit s'y adapter. */
  draftContext?: string | null;
  /** Extrait texte du PDF de présentation projet (deck). */
  presentationExcerpt?: string | null;
};

function line(label: string, value: unknown): string {
  const v = String(value || "").trim();
  return v ? `- ${label} : ${v}` : "";
}

/**
 * Prospection individuelle talent (pipeline solo) vs brief campagne projets-outreach.
 * Heuristique : pas de titre / livrables / timeline / budget campagne.
 */
export function isTalentIndividualProspectingBrief(
  brief: ProjectResearchBrief | null | undefined
): boolean {
  if (!brief) return false;
  return !(
    String(brief.projectTitle || "").trim() ||
    String(brief.deliverables || "").trim() ||
    String(brief.timeline || "").trim() ||
    String(brief.budgetRange || "").trim()
  );
}

/** Bloc texte brief pour injection dans un prompt IA. */
export function formatProjectBriefForPrompt(
  brief: ProjectResearchBrief,
  index?: number
): string {
  const talentMode = isTalentIndividualProspectingBrief(brief);
  const talentLabel = String(brief.creatorName || "").trim();
  const titleLabel = String(brief.projectTitle || "").trim();
  const header =
    typeof index === "number"
      ? `${talentMode ? "PROSPECTION" : "PROJET"} ${index + 1}${
          talentLabel ? ` — ${talentLabel}` : ""
        }`
      : talentMode
        ? "PROSPECTION TALENT (individuelle)"
        : "BRIEF PROJET";
  const pdfOwner = [talentLabel, titleLabel ? `« ${titleLabel} »` : ""]
    .filter(Boolean)
    .join(" / ");
  const pdfSafe = sanitizePresentationExcerpt(
    String(brief.presentationExcerpt || "")
  );
  const pdfLine = pdfSafe
    ? line(
        pdfOwner
          ? `Extrait PDF présentation (UNIQUEMENT ${pdfOwner} — ne pas attribuer à un autre talent/projet)`
          : "Extrait PDF présentation (ne pas mélanger avec un autre brief)",
        pdfSafe
      )
    : "";
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
    line("Contexte ops (prioritaire)", brief.draftContext),
    pdfLine,
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
      String(b.recommendedAngle || "").trim() ||
      String(b.draftContext || "").trim() ||
      String(b.presentationExcerpt || "").trim()
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
  const tid = String(talentId || "").trim();
  if (briefs.length > 0) {
    // Match strict talentId — évite d'attribuer le PDF / brief d'un autre talent.
    if (tid) {
      const byId = briefs.find((b) => String(b.talentId || "").trim() === tid);
      if (byId) return byId;
    }
    // Un seul brief : OK. Plusieurs sans match → ne pas retomber sur le 1er
    // (sinon PDF talent A collé sur l'analyse talent B).
    if (briefs.length === 1) return briefs[0];
    return null;
  }
  return opts.projectBrief || null;
}
