"use client";

import { toast } from "sonner";
import type { CannesPdfSectionFlags } from "@/lib/cannes/planningPdfSections";
import { flagsToSectionsSearchParam, filenameSlugForFlags } from "@/lib/cannes/planningPdfSections";

export async function downloadCannesPlanningPdf(flags: CannesPdfSectionFlags) {
  try {
    const qs = flagsToSectionsSearchParam(flags);
    const sep = qs ? "&" : "";
    const url = qs
      ? `/api/cannes/planning-team/pdf?${qs}${sep}ts=${Date.now()}`
      : `/api/cannes/planning-team/pdf?ts=${Date.now()}`;
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    const day = new Date().toISOString().slice(0, 10);
    link.download = `cannes-2026-${filenameSlugForFlags(flags)}-${day}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    toast.success("PDF téléchargé");
  } catch {
    toast.error("Erreur lors de l'export PDF");
  }
}
