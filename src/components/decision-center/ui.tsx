import type { DcLevel } from "@/lib/decision-center/constants";
import { DC_LEVEL_EMOJI, DC_LEVEL_LABELS } from "@/lib/decision-center/labels";

export function LevelBadge({ level }: { level: DcLevel | string }) {
  const l = level as DcLevel;
  const styles: Record<string, string> = {
    GREEN: "bg-emerald-50 text-emerald-800 border-emerald-200",
    ORANGE: "bg-amber-50 text-amber-900 border-amber-200",
    RED: "bg-red-50 text-red-800 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[l] ?? "bg-gray-100"}`}
    >
      <span aria-hidden="true">{DC_LEVEL_EMOJI[l]}</span>
      <span>{DC_LEVEL_LABELS[l] ?? l}</span>
    </span>
  );
}

export function PrincipleBanner() {
  return (
    <div className="rounded-xl border border-glowup-rose/20 bg-white px-4 py-3 text-sm text-glowup-licorice">
      <p className="font-medium">
        Si une décision entre clairement dans ton autonomie, tu es responsable de la
        prendre. Il n’est pas nécessaire de demander une validation supplémentaire à Sofian.
      </p>
      <p className="mt-1 text-gray-600">Toute escalade doit comporter une recommandation.</p>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card text-center text-sm text-gray-500">
      <p className="font-medium text-glowup-licorice">{title}</p>
      <p className="mt-1">{hint}</p>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string;
  href?: string;
}) {
  const inner = (
    <div className="card card-hover">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-3xl text-glowup-licorice">{value}</p>
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "badge-neutral",
    SUBMITTED: "badge-warning",
    NEEDS_INFORMATION: "badge-info",
    APPROVED: "badge-success",
    REJECTED: "badge-danger",
    CANCELLED: "badge-neutral",
    EXECUTED: "badge-success",
    CLOSED: "badge-neutral",
  };
  const labels: Record<string, string> = {
    DRAFT: "Brouillon",
    SUBMITTED: "À traiter",
    NEEDS_INFORMATION: "Précision",
    APPROVED: "Approuvée",
    REJECTED: "Refusée",
    CANCELLED: "Annulée",
    EXECUTED: "Exécutée",
    CLOSED: "Clôturée",
  };
  return <span className={`badge ${map[status] ?? "badge-neutral"}`}>{labels[status] ?? status}</span>;
}
