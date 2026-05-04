"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "./Modal";
import { downloadCannesPlanningPdf } from "../downloadPlanningPdf";
import type { CannesPdfSectionFlags } from "@/lib/cannes/planningPdfSections";
import { CANNES_PDF_SECTION_KEYS } from "@/lib/cannes/planningPdfSections";

type Props = {
  /** Cases cochées à l’ouverture de la modale (ex. onglet équipe → équipe seule). */
  defaults: CannesPdfSectionFlags;
  buttonLabel?: string;
  /** Classes Tailwind pour le bouton (ex. arrondi plein sur l’agenda). */
  buttonClassName?: string;
  /** Optionnel : masque jour/personne appliqué dans la vue officielle équipe. */
  teamHiddenByDay?: Record<string, true>;
};

const LABELS: Record<(typeof CANNES_PDF_SECTION_KEYS)[number], string> = {
  team: "Planning équipe (synthèse + fiches)",
  talents: "Planning talents (synthèse + fiches)",
  events: "Agenda (liste des événements)",
};

export default function PlanningPdfExportModal({
  defaults,
  buttonLabel = "Exporter PDF…",
  buttonClassName = "rounded border border-[#E5E0D8] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]",
  teamHiddenByDay,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState<CannesPdfSectionFlags>(() => ({ ...defaults }));

  useEffect(() => {
    if (open) {
      setFlags({
        team: defaults.team,
        talents: defaults.talents,
        events: defaults.events,
      });
    }
  }, [open, defaults.team, defaults.talents, defaults.events]);

  async function runExport() {
    if (!flags.team && !flags.talents && !flags.events) {
      toast.error("Cochez au moins une section à exporter");
      return;
    }
    setLoading(true);
    try {
      await downloadCannesPlanningPdf(flags, { teamHiddenByDay });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function toggle(key: keyof CannesPdfSectionFlags) {
    setFlags((f) => ({ ...f, [key]: !f[key] }));
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>

      <Modal open={open} title="Exporter en PDF" onClose={() => !loading && setOpen(false)}>
        <p className="text-sm text-[#1A1110]/70">
          Cochez les parties à inclure dans le fichier. La synthèse par jour n&apos;apparaît que si équipe
          et/ou talents sont sélectionnés.
        </p>
        <div className="mt-4 space-y-3">
          {CANNES_PDF_SECTION_KEYS.map((key) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 text-sm text-[#1A1110]">
              <input
                type="checkbox"
                className="mt-1"
                checked={flags[key]}
                onChange={() => toggle(key)}
                disabled={loading}
              />
              <span>{LABELS[key]}</span>
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => setOpen(false)}
            className="rounded border border-[#E5E0D8] px-4 py-2 text-sm"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runExport()}
            className="rounded bg-[#1A1110] px-4 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B] disabled:opacity-50"
          >
            {loading ? "…" : "Télécharger le PDF"}
          </button>
        </div>
      </Modal>
    </>
  );
}
