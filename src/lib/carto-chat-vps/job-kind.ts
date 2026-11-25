/**
 * Distingue les jobs Chat VPS carto vs outreach (mail / roster) vs brand-sim
 * vs cannes-carto. Même worker / mêmes slots — le lab carto ne doit lister
 * que la carto générique.
 */

import { brandSimPromptLooksLike } from "@/lib/brand-sim-chat/tag";
import { cannesCartoPromptLooksLike } from "@/lib/cannes-partenaires/tag";

export function isOutreachChatVpsJob(previewOrHint: string): boolean {
  const t = String(previewOrHint || "");
  if (/business developer/i.test(t)) return true;
  if (/rédiges UN mail de prospection/i.test(t)) return true;
  if (/head of casting/i.test(t)) return true;
  if (/analyses le roster/i.test(t)) return true;
  if (/FORMAT DE RÉPONSE \(STRICT\)[\s\S]*SUBJECT\s*:/i.test(t)) return true;
  return false;
}

/** Simulateur marque (BRAND_SIM) — même VPS carto, exclu du lab carto-pipeline2. */
export function isBrandSimChatVpsJob(job: {
  promptPreview?: string | null;
  companyHint?: string | null;
  kind?: string | null;
}): boolean {
  if (job.kind === "outreach") return false;
  const preview = String(job.promptPreview || "");
  const hint = String(job.companyHint || "");
  return brandSimPromptLooksLike(`${preview} ${hint}`);
}

/** Carto Cannes Partenaires (CANNES_CARTO) — exclu du lab carto-pipeline2. */
export function isCannesCartoChatVpsJob(job: {
  promptPreview?: string | null;
  companyHint?: string | null;
  kind?: string | null;
}): boolean {
  if (job.kind === "outreach") return false;
  const preview = String(job.promptPreview || "");
  const hint = String(job.companyHint || "");
  return cannesCartoPromptLooksLike(`${preview} ${hint}`);
}

export function isCartoChatVpsJob(job: {
  promptPreview?: string | null;
  companyHint?: string | null;
  kind?: string | null;
}): boolean {
  if (job.kind === "outreach") return false;
  // Brand-sim / Cannes-carto tournent en kind=carto mais ne doivent pas polluer le lab.
  if (isBrandSimChatVpsJob(job)) return false;
  if (isCannesCartoChatVpsJob(job)) return false;
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
