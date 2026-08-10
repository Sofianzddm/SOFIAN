"use client";

import { ShieldAlert } from "lucide-react";

/** Bannette confidentielle — à afficher partout sur le simulateur cessions. */
export function CessionsConfidentialNote({
  compact = false,
}: {
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-600">
        <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />
        Confidentiel — usage interne Glow Up uniquement
      </p>
    );
  }

  return (
    <div
      role="note"
      className="flex gap-2.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-red-800 shadow-[0_0_0_1px_rgba(220,38,38,0.08)]"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <div className="min-w-0 text-xs leading-relaxed sm:text-sm">
        <p className="font-bold uppercase tracking-[0.12em] text-red-700">
          Confidentiel
        </p>
        <p className="mt-0.5 text-red-800/90">
          Outil interne Glow Up. Ne pas transmettre aux marques, talents ou
          partenaires. Grilles, coefficients et montants réservés à l&apos;équipe.
        </p>
      </div>
    </div>
  );
}
