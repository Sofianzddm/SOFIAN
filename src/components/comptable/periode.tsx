"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

export interface Periode {
  dateDebut: string; // YYYY-MM-DD
  dateFin: string; // YYYY-MM-DD
  label: string;
}

const STORAGE_KEY = "comptable.periode";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function presetAnneeEnCours(): Periode {
  const y = new Date().getFullYear();
  return {
    dateDebut: ymd(new Date(y, 0, 1)),
    dateFin: ymd(new Date(y, 11, 31)),
    label: `Année ${y}`,
  };
}

function presetAnneePrecedente(): Periode {
  const y = new Date().getFullYear() - 1;
  return {
    dateDebut: ymd(new Date(y, 0, 1)),
    dateFin: ymd(new Date(y, 11, 31)),
    label: `Année ${y}`,
  };
}

function presetTrimestre(): Periode {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const debut = new Date(now.getFullYear(), q * 3, 1);
  const fin = new Date(now.getFullYear(), q * 3 + 3, 0);
  return {
    dateDebut: ymd(debut),
    dateFin: ymd(fin),
    label: `T${q + 1} ${now.getFullYear()}`,
  };
}

function presetMois(): Periode {
  const now = new Date();
  const debut = new Date(now.getFullYear(), now.getMonth(), 1);
  const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    dateDebut: ymd(debut),
    dateFin: ymd(fin),
    label: debut.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
  };
}

export function usePeriode(): [Periode, (p: Periode) => void] {
  const [periode, setPeriode] = useState<Periode>(presetAnneeEnCours());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPeriode(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const update = (p: Periode) => {
    setPeriode(p);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  return [periode, update];
}

export function PeriodeBar({
  periode,
  onChange,
}: {
  periode: Periode;
  onChange: (p: Periode) => void;
}) {
  const presets = [
    { key: "mois", build: presetMois, label: "Mois" },
    { key: "trim", build: presetTrimestre, label: "Trimestre" },
    { key: "annee", build: presetAnneeEnCours, label: "Année N" },
    { key: "anneePrec", build: presetAnneePrecedente, label: "Année N-1" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 pr-2 text-gray-500">
        <Calendar className="h-4 w-4" />
        <span className="text-sm font-medium">Période</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => {
          const built = p.build();
          const active =
            built.dateDebut === periode.dateDebut &&
            built.dateFin === periode.dateFin;
          return (
            <button
              key={p.key}
              onClick={() => onChange(built)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-glowup-rose text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <input
          type="date"
          value={periode.dateDebut}
          onChange={(e) =>
            onChange({
              ...periode,
              dateDebut: e.target.value,
              label: "Personnalisée",
            })
          }
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-glowup-rose focus:outline-none"
        />
        <span className="text-gray-400">→</span>
        <input
          type="date"
          value={periode.dateFin}
          onChange={(e) =>
            onChange({
              ...periode,
              dateFin: e.target.value,
              label: "Personnalisée",
            })
          }
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-glowup-rose focus:outline-none"
        />
      </div>
    </div>
  );
}

export function formatEUR(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDateFR(value: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
}
