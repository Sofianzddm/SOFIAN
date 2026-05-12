"use client";

import { toast } from "sonner";
import type { CannesPdfSectionFlags } from "@/lib/cannes/planningPdfSections";
import { flagsToSectionsSearchParam, filenameSlugForFlags } from "@/lib/cannes/planningPdfSections";

export type CannesPlanningPdfDownloadOptions = {
  teamHiddenByDay?: Record<string, true>;
  presenceId?: string;
  /** N’affiche pas les toasts succès / erreur (export groupé). */
  silent?: boolean;
};

function parseFilenameFromContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const mStar = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (mStar) {
    try {
      return decodeURIComponent(mStar[1].trim());
    } catch {
      /* ignore */
    }
  }
  const m = header.match(/filename\s*=\s*("([^"]+)"|([^;\s]+))/i);
  if (m) return (m[2] || m[3] || "").trim();
  return undefined;
}

function buildPlanningPdfSearchParams(flags: CannesPdfSectionFlags, options?: CannesPlanningPdfDownloadOptions) {
  const params = new URLSearchParams();
  const qs = flagsToSectionsSearchParam(flags);
  if (qs.startsWith("sections=")) {
    const m = qs.match(/^sections=(.+)$/);
    if (m) params.set("sections", decodeURIComponent(m[1]));
  }
  params.set("ts", String(Date.now()));

  if (options?.teamHiddenByDay) {
    const hiddenKeys = Object.keys(options.teamHiddenByDay).filter((k) => options.teamHiddenByDay?.[k]);
    if (hiddenKeys.length > 0) {
      params.set("teamHidden", JSON.stringify(hiddenKeys));
    }
  }

  if (options?.presenceId) {
    params.set("presenceId", options.presenceId);
  }

  return params;
}

function triggerBlobDownload(blob: Blob, downloadName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

const DEFAULT_BATCH_DELAY_MS = 450;

/**
 * PDF d’un collaborateur : créneaux + agenda pour un jour du festival.
 */
export async function downloadTeamDayOnePersonPdf(
  dateYmd: string,
  presenceId: string,
  options?: { silent?: boolean }
): Promise<boolean> {
  const silent = options?.silent ?? false;
  try {
    const params = new URLSearchParams();
    params.set("date", dateYmd);
    params.set("presenceId", presenceId);
    params.set("ts", String(Date.now()));
    const url = `/api/cannes/team-planning-slots/pdf-day?${params.toString()}`;
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const fromHeader = parseFilenameFromContentDisposition(res.headers.get("Content-Disposition"));
    const safe = dateYmd.replace(/-/g, "");
    const fallback = `cannes-2026-jour-${safe}-${presenceId.slice(0, 8)}.pdf`;
    triggerBlobDownload(blob, fromHeader || fallback);
    if (!silent) toast.success("PDF du jour téléchargé");
    return true;
  } catch {
    if (!silent) toast.error("Erreur lors de l'export PDF du jour");
    return false;
  }
}

/**
 * Un PDF par collaborateur (même jour), avec une courte pause entre chaque fichier.
 */
export async function downloadTeamDayIndividualPdfs(
  dateYmd: string,
  presenceIds: string[],
  options?: { delayMs?: number }
): Promise<{ ok: number; fail: number }> {
  const delayMs = options?.delayMs ?? DEFAULT_BATCH_DELAY_MS;
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < presenceIds.length; i++) {
    const id = presenceIds[i]!;
    const success = await downloadTeamDayOnePersonPdf(dateYmd, id, { silent: true });
    if (success) ok++;
    else fail++;
    if (i < presenceIds.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  if (presenceIds.length === 0) {
    toast.message("Aucune présence à exporter");
    return { ok: 0, fail: 0 };
  }
  if (fail === 0) {
    toast.success(`${ok} PDF téléchargé${ok > 1 ? "s" : ""} (sur place, jour sélectionné)`);
  } else {
    toast.error(`${ok} réussi(s), ${fail} échec(s) — vérifie les autorisations de téléchargement.`);
  }
  return { ok, fail };
}

/**
 * PDF unique : toute l’équipe sur une seule page (tous les plannings du jour).
 */
export async function downloadTeamDayAllIndividualsPdf(
  dateYmd: string,
  options?: { silent?: boolean }
): Promise<boolean> {
  const silent = options?.silent ?? false;
  try {
    const params = new URLSearchParams();
    params.set("date", dateYmd);
    params.set("ts", String(Date.now()));
    const url = `/api/cannes/team-planning-slots/pdf-day?${params.toString()}`;
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const fromHeader = parseFilenameFromContentDisposition(res.headers.get("Content-Disposition"));
    const safe = dateYmd.replace(/-/g, "");
    const fallback = `cannes-2026-planning-jour-${safe}-sur-place.pdf`;
    triggerBlobDownload(blob, fromHeader || fallback);
    if (!silent) toast.success("PDF du jour téléchargé");
    return true;
  } catch {
    if (!silent) toast.error("Erreur lors de l'export PDF du jour");
    return false;
  }
}

/**
 * PDF planning individuel « kanban » : une page de couverture + pages paysage (6 jours / page),
 * colonnes par jour avec créneaux et événements agenda.
 */
export async function downloadTeamIndividualKanbanPdf(
  presenceId: string,
  options?: { silent?: boolean }
): Promise<boolean> {
  const silent = options?.silent ?? false;
  try {
    const params = new URLSearchParams();
    params.set("presenceId", presenceId);
    params.set("ts", String(Date.now()));
    const url = `/api/cannes/team-planning-slots/pdf?${params.toString()}`;
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const fromHeader = parseFilenameFromContentDisposition(res.headers.get("Content-Disposition"));
    const fallback = `cannes-2026-planning-kanban-${presenceId.slice(0, 8)}.pdf`;
    triggerBlobDownload(blob, fromHeader || fallback);
    if (!silent) toast.success("PDF kanban téléchargé");
    return true;
  } catch {
    if (!silent) toast.error("Erreur lors de l'export PDF kanban");
    return false;
  }
}

export async function downloadTeamIndividualKanbanPdfsIndividually(
  presenceIds: string[],
  options?: { delayMs?: number }
): Promise<{ ok: number; fail: number }> {
  const delayMs = options?.delayMs ?? DEFAULT_BATCH_DELAY_MS;
  let ok = 0;
  let fail = 0;
  for (const id of presenceIds) {
    const success = await downloadTeamIndividualKanbanPdf(id, { silent: true });
    if (success) ok++;
    else fail++;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (presenceIds.length === 0) {
    toast.message("Aucune présence à exporter");
    return { ok: 0, fail: 0 };
  }
  if (fail === 0) {
    toast.success(`${ok} PDF kanban téléchargé${ok > 1 ? "s" : ""}`);
  } else {
    toast.error(`${ok} réussi(s), ${fail} échec(s) — vérifie les téléchargements multiples.`);
  }
  return { ok, fail };
}

/**
 * Télécharge un PDF planning (global ou une présence si `presenceId` est renseigné).
 * @returns true si le fichier a bien été téléchargé.
 */
export async function downloadCannesPlanningPdf(
  flags: CannesPdfSectionFlags,
  options?: CannesPlanningPdfDownloadOptions
): Promise<boolean> {
  const silent = options?.silent ?? false;
  try {
    const params = buildPlanningPdfSearchParams(flags, options);
    const url = `/api/cannes/planning-team/pdf?${params.toString()}`;
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const day = new Date().toISOString().slice(0, 10);
    const fromHeader = parseFilenameFromContentDisposition(res.headers.get("Content-Disposition"));
    const fallback = `cannes-2026-${filenameSlugForFlags(flags)}-${day}.pdf`;
    triggerBlobDownload(blob, fromHeader || fallback);
    if (!silent) toast.success("PDF téléchargé");
    return true;
  } catch {
    if (!silent) toast.error("Erreur lors de l'export PDF");
    return false;
  }
}

/**
 * Un PDF par id de présence (mêmes options de sections pour tous).
 * Petite pause entre chaque fichier pour limiter les blocages navigateur.
 */
export async function downloadCannesPlanningPdfsIndividually(
  presenceIds: string[],
  flags: CannesPdfSectionFlags,
  options?: { teamHiddenByDay?: Record<string, true>; delayMs?: number }
): Promise<{ ok: number; fail: number }> {
  const delayMs = options?.delayMs ?? DEFAULT_BATCH_DELAY_MS;
  let ok = 0;
  let fail = 0;
  for (const id of presenceIds) {
    const success = await downloadCannesPlanningPdf(flags, {
      presenceId: id,
      teamHiddenByDay: options?.teamHiddenByDay,
      silent: true,
    });
    if (success) ok++;
    else fail++;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (presenceIds.length === 0) {
    toast.message("Aucune présence à exporter");
    return { ok: 0, fail: 0 };
  }
  if (fail === 0) {
    toast.success(`${ok} PDF téléchargé${ok > 1 ? "s" : ""}`);
  } else {
    toast.error(`${ok} réussi(s), ${fail} échec(s) — vérifie les autorisations de téléchargement.`);
  }
  return { ok, fail };
}
