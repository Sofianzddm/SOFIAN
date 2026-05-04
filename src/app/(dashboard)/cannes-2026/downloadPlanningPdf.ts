"use client";

import { toast } from "sonner";
import type { CannesPdfSectionFlags } from "@/lib/cannes/planningPdfSections";
import { flagsToSectionsSearchParam, filenameSlugForFlags } from "@/lib/cannes/planningPdfSections";

type DownloadOptions = {
  teamHiddenByDay?: Record<string, true>;
};

export async function downloadCannesPlanningPdf(flags: CannesPdfSectionFlags, options?: DownloadOptions) {
  try {
    const qs = flagsToSectionsSearchParam(flags);
    const params = new URLSearchParams();
    if (qs) params.set("sections", qs);
    params.set("ts", String(Date.now()));

    if (options?.teamHiddenByDay) {
      const hiddenKeys = Object.keys(options.teamHiddenByDay).filter((k) => options.teamHiddenByDay?.[k]);
      if (hiddenKeys.length > 0) {
        params.set("teamHidden", JSON.stringify(hiddenKeys));
      }
    }

    const url = `/api/cannes/planning-team/pdf?${params.toString()}`;
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
