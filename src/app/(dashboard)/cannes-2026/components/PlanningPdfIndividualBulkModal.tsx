"use client";

import { useMemo, useState } from "react";
import Modal from "./Modal";
import { downloadCannesPlanningPdfsIndividually } from "../downloadPlanningPdf";
import type { CannesPdfSectionFlags } from "@/lib/cannes/planningPdfSections";

type Props = {
  presenceIds: string[];
  /** Sections de base (ex. équipe seule ou talents seuls). */
  baseFlags: CannesPdfSectionFlags;
  teamHiddenByDay?: Record<string, true>;
  buttonLabel?: string;
  buttonClassName?: string;
};

export default function PlanningPdfIndividualBulkModal({
  presenceIds,
  baseFlags,
  teamHiddenByDay,
  buttonLabel = "PDF individuels…",
  buttonClassName = "rounded border border-[#E5E0D8] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [withEvents, setWithEvents] = useState(false);

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
      await downloadCannesPlanningPdfsIndividually(presenceIds, exportFlags, { teamHiddenByDay });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName} disabled={n === 0}>
        {buttonLabel}
      </button>

      <Modal open={open} title="Un PDF par personne" onClose={() => !loading && setOpen(false)}>
        <p className="text-sm text-[#1A1110]/70">
          Télécharge <strong>{n}</strong> fichier{n > 1 ? "s" : ""} PDF distinct{n > 1 ? "s" : ""} — un par fiche présence
          sur cet onglet. Le navigateur peut demander d&apos;autoriser les téléchargements multiples ; une courte pause
          est faite entre chaque fichier.
        </p>
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
            {loading ? "…" : `Télécharger ${n} PDF`}
          </button>
        </div>
      </Modal>
    </>
  );
}
