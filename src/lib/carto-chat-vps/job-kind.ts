/**
 * Distingue les jobs Chat VPS carto vs outreach (mail / roster).
 * Même worker / mêmes slots — le lab carto ne doit lister que la carto.
 */

export function isOutreachChatVpsJob(previewOrHint: string): boolean {
  const t = String(previewOrHint || "");
  if (/business developer/i.test(t)) return true;
  if (/rédiges UN mail de prospection/i.test(t)) return true;
  if (/head of casting/i.test(t)) return true;
  if (/analyses le roster/i.test(t)) return true;
  if (/FORMAT DE RÉPONSE \(STRICT\)[\s\S]*SUBJECT\s*:/i.test(t)) return true;
  return false;
}

export function isCartoChatVpsJob(job: {
  promptPreview?: string | null;
  companyHint?: string | null;
  kind?: string | null;
}): boolean {
  if (job.kind === "outreach") return false;
  if (job.kind === "carto") return true;
  const preview = String(job.promptPreview || "");
  const hint = String(job.companyHint || "");
  const blob = `${preview} ${hint}`;
  if (isOutreachChatVpsJob(blob)) return false;
  if (/Head of Research Influence|MARQUE À ANALYSER/i.test(blob)) return true;
  // Hint marque court (extrait worker) sans « Tu es … »
  if (hint && !/^Tu es /i.test(hint) && hint.length <= 80) return true;
  if (/^Tu es un \*\*Head of Research/i.test(preview)) return true;
  return false;
}
