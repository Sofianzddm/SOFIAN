"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Instagram,
  Music2,
  Youtube,
  Loader2,
  Users,
  ChevronRight,
} from "lucide-react";

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  bio: string | null;
  presentation: string | null;
  ville: string | null;
  pays: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  niches: string[];
  igFollowers: number | null;
  igEngagement: number | null;
  ttFollowers: number | null;
  ttEngagement: number | null;
  ytAbonnes: number | null;
}

const ALL = "all";

function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

export default function CommunityTalentsPage() {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nicheFilter, setNicheFilter] = useState(ALL);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/community/talents");
        if (res.ok) setTalents(await res.json());
      } catch (e) {
        console.error("Erreur:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const niches = useMemo(
    () =>
      Array.from(new Set(talents.flatMap((t) => t.niches))).sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [talents]
  );

  const filtered = useMemo(() => {
    return talents.filter((t) => {
      const term = search.toLowerCase();
      const matchSearch =
        !term ||
        `${t.prenom} ${t.nom}`.toLowerCase().includes(term) ||
        (t.instagram || "").toLowerCase().includes(term) ||
        (t.tiktok || "").toLowerCase().includes(term) ||
        t.niches.some((n) => n.toLowerCase().includes(term));
      const matchNiche = nicheFilter === ALL || t.niches.includes(nicheFilter);
      return matchSearch && matchNiche;
    });
  }, [talents, search, nicheFilter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Talents</h1>
        <p className="mt-1 text-sm text-slate-500">
          {filtered.length} talent{filtered.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Recherche + filtre */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher un talent, un réseau, une niche..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border-0 bg-slate-50 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Niche
          </span>
          <select
            value={nicheFilter}
            onChange={(e) => setNicheFilter(e.target.value)}
            className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200"
          >
            <option value={ALL}>Toutes les niches</option>
            {niches.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-slate-100/80 p-5">
              <div className="flex gap-4">
                <div className="h-16 w-16 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2 pt-2">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-3 w-20 rounded bg-slate-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-24">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Users className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-base font-medium text-slate-900">Aucun talent</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-slate-500">
            Aucun talent ne correspond à ta recherche.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/community/talents/${t.id}`}
              className="group flex flex-col rounded-2xl bg-white p-5 ring-1 ring-slate-200/60 transition-all hover:ring-slate-300"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                  {t.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.photo} alt={`${t.prenom} ${t.nom}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-semibold text-slate-400">
                      {t.prenom?.[0]}
                      {t.nom?.[0]}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-900">
                    {t.prenom} {t.nom}
                  </h3>
                  {(t.ville || t.pays) && (
                    <p className="truncate text-sm text-slate-500">
                      {[t.ville, t.pays].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
              </div>

              {t.niches.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {t.niches.slice(0, 3).map((n) => (
                    <span
                      key={n}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                    >
                      {n}
                    </span>
                  ))}
                  {t.niches.length > 3 && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
                      +{t.niches.length - 3}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-sm">
                {t.instagram && (
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <Instagram className="h-4 w-4 text-slate-400" />
                    {formatCount(t.igFollowers)}
                  </span>
                )}
                {t.tiktok && (
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <Music2 className="h-4 w-4 text-slate-400" />
                    {formatCount(t.ttFollowers)}
                  </span>
                )}
                {t.youtube && (
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <Youtube className="h-4 w-4 text-slate-400" />
                    {formatCount(t.ytAbonnes)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
