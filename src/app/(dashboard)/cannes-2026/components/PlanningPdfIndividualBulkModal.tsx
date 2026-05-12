"use client";

import { useMemo, useState } from "react";
import Modal from "./Modal";
import {
  downloadCannesPlanningPdfsIndividually,
  downloadTeamIndividualKanbanPdfsIndividually,
} from "../downloadPlanningPdf";
import type { CannesPdfSectionFlags } from "@/lib/cannes/planningPdfSections";

type Props = {
  presenceIds: string[];
  /** Sections de base (ex. équipe seule ou talents seuls). */
  baseFlags: CannesPdfSectionFlags;
  teamHiddenByDay?: Record<string, true>;
  buttonLabel?: string;
  buttonClassName?: string;
  /** Si true : propose aussi l’export PDF « kanban créneaux » (équipe uniquement). */
  offerKanbanSlotsPdf?: boolean;
};

export default function PlanningPdfIndividualBulkModal({
  presenceIds,
  baseFlags,
  teamHiddenByDay,
  buttonLabel = "PDF individuels…",
  buttonClassName = "rounded border border-[#E5E0D8] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]",
  offerKanbanSlotsPdf = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [withEvents, setWithEvents] = useState(false);
  const [pdfKind, setPdfKind] = useState<"classic" | "kanban">("classic");

  const n = presenceIds.length;

  const exportFlags = useMemo(
    (): CannesPdfSectionFlags => ({
      ...baseFlags,
      events: withEvents,
    }),
    [baseFlags, withEvents]
  );

  async function runBatch() {
    if (n === 0) return;
    setLoading(true);
    try {
      if (pdfKind === "kanban") {
        await downloadTeamIndividualKanbanPdfsIndividually(presenceIds);
      } else {
        await downloadCannesPlanningPdfsIndividually(presenceIds, exportFlags, { teamHiddenByDay });
      }
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const isKanban = offerKanbanSlotsPdf && pdfKind === "kanban";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName} disabled={n === 0}>
        {buttonLabel}
      </button>

      <Modal
        open={open}
        title={offerKanbanSlotsPdf ? "Exporter un PDF par personne" : "Un PDF par personne"}
        onClose={() => !loading && setOpen(false)}
      >
        <p className="text-sm text-[#1A1110]/70">
          Télécharge <strong>{n}</strong> fichier{n > 1 ? "s" : ""} PDF distinct{n > 1 ? "s" : ""} — un par fiche présence
          sur cet onglet. Le navigateur peut demander d&apos;autoriser les téléchargements multiples ; une courte pause
          est faite entre chaque fichier.
        </p>

        {offerKanbanSlotsPdf ? (
          <fieldset className="mt-4 space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-[#1A1110]/55">
              Format du PDF
            </legend>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-[#1A1110]">
              <input
                type="radio"
                name="pdf-kind"
                className="mt-1"
                checked={pdfKind === "classic"}
                onChange={() => setPdfKind("classic")}
                disabled={loading}
              />
              <span>
                <strong>Planning classique</strong> — grille équipe / disponibilités (comme avant).
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-[#1A1110]">
              <input
                type="radio"
                name="pdf-kind"
                className="mt-1"
                checked={pdfKind === "kanban"}
                onChange={() => setPdfKind("kanban")}
                disabled={loading}
              />
              <span>
                <strong>Planning créneaux — kanban</strong> — couverture + pages paysage : une colonne par jour du
                festival, cartes horaires, événements agenda et légende des statuts (sur place / indispo).
              </span>
            </label>
          </fieldset>
        ) : null}

        {!isKanban ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-[#1A1110]">
            <input
              type="checkbox"
              className="mt-1"
              checked={withEvents}
              onChange={() => setWithEvents((v) => !v)}
              disabled={loading}
            />
            <span>Inclure l&apos;agenda Cannes dans chaque PDF</span>
          </label>
        ) : (
          <p className="mt-3 rounded-lg border border-[#E5E0D8] bg-[#FCFAF8] px-3 py-2 text-xs text-[#1A1110]/75">
            Le format kanban inclut déjà les événements auxquels la personne est inscrite, jour par jour.
          </p>
        )}

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
            disabled={loading || n === 0}
            onClick={() => void runBatch()}
            className="rounded bg-[#1A1110] px-4 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B] disabled:opacity-50"
          >
            {loading ? "…" : isKanban ? `Télécharger ${n} PDF kanban` : `Télécharger ${n} PDF`}
          </button>
        </div>
      </Modal>
    </>
  );
}
