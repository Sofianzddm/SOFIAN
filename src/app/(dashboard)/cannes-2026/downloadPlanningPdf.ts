"use client";

import { toast } from "sonner";

export async function downloadCannesPlanningPdf() {
  try {
    const res = await fetch("/api/cannes/planning-team/pdf", { credentials: "include" });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cannes-2026-planning-complet-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("PDF téléchargé");
  } catch {
    toast.error("Erreur lors de l'export PDF");
  }
}
