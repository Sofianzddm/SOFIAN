"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Calendar,
  Building2,
  Loader2,
  ExternalLink,
  Package,
  Eye,
  ChevronRight,
  Filter,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story",
  STORY_CONCOURS: "Story Concours",
  POST: "Post",
  POST_CONCOURS: "Post Concours",
  POST_COMMUN: "Post Commun",
  REEL: "Reel",
  TIKTOK_VIDEO: "Vidéo TikTok",
  YOUTUBE_VIDEO: "Vidéo YouTube",
  YOUTUBE_SHORT: "YouTube Short",
  SNAPCHAT_STORY: "Snapchat Story",
  SNAPCHAT_SPOTLIGHT: "Snapchat Spotlight",
  EVENT: "Event",
  SHOOTING: "Shooting",
  AMBASSADEUR: "Ambassadeur",
};

interface Livrable {
  typeContenu: string;
  quantite: number;
  description: string | null;
}

interface Collab {
  id: string;
  reference: string;
  marque: string;
  marqueId: string;
  secteur: string | null;
  talentId: string;
  talentNom: string;
  talentPhoto: string | null;
  statut: string;
  lienPublication: string | null;
  isStory: boolean;
  datePublication: string | null;
  createdAt: string;
  livrables: Livrable[];
}

const ALL = "all";

export default function CommunityCollaborationsPage() {
  const [collaborations, setCollaborations] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [marqueFilter, setMarqueFilter] = useState(ALL);
  const [talentFilter, setTalentFilter] = useState(ALL);
  const [moisFilter, setMoisFilter] = useState(ALL);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/community/collaborations");
        if (res.ok) setCollaborations(await res.json());
      } catch (e) {
        console.error("Erreur:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const marques = useMemo(
    () =>
      Array.from(new Set(collaborations.map((c) => c.marque))).sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [collaborations]
  );

  const talents = useMemo(
    () =>
      Array.from(new Set(collaborations.map((c) => c.talentNom))).sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [collaborations]
  );

  const moisOptions = useMemo(() => {
    const keys = new Map<string, string>();
    collaborations.forEach((c) => {
      const d = new Date(c.datePublication || c.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!keys.has(key)) {
        keys.set(
          key,
          d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
        );
      }
    });
    return Array.from(keys.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [collaborations]);

  const filtered = useMemo(() => {
    return collaborations.filter((c) => {
      const term = searchTerm.toLowerCase();
      const matchSearch =
        !term ||
        c.marque.toLowerCase().includes(term) ||
        c.talentNom.toLowerCase().includes(term) ||
        c.reference.toLowerCase().includes(term);
      const matchMarque = marqueFilter === ALL || c.marque === marqueFilter;
      const matchTalent = talentFilter === ALL || c.talentNom === talentFilter;
      const d = new Date(c.datePublication || c.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const matchMois = moisFilter === ALL || key === moisFilter;
      return matchSearch && matchMarque && matchTalent && matchMois;
    });
  }, [collaborations, searchTerm, marqueFilter, talentFilter, moisFilter]);

  const hasActiveFilter =
    marqueFilter !== ALL || talentFilter !== ALL || moisFilter !== ALL;

  const selectClass =
    "h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Collaborations publiées
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {filtered.length} collaboration{filtered.length > 1 ? "s" : ""}
          {hasActiveFilter || searchTerm ? " (filtrée" + (filtered.length > 1 ? "s)" : ")") : ""}
        </p>
      </div>

      {/* Recherche + filtres */}
      <div className="mb-6 space-y-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher une marque, un talent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border-0 bg-slate-50 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Filtres
          </span>
          <select
            value={marqueFilter}
            onChange={(e) => setMarqueFilter(e.target.value)}
            className={selectClass}
          >
            <option value={ALL}>Toutes les marques</option>
            {marques.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={talentFilter}
            onChange={(e) => setTalentFilter(e.target.value)}
            className={selectClass}
          >
            <option value={ALL}>Tous les talents</option>
            {talents.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={moisFilter}
            onChange={(e) => setMoisFilter(e.target.value)}
            className={selectClass}
          >
            <option value={ALL}>Tous les mois</option>
            {moisOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {(hasActiveFilter || searchTerm) && (
            <button
              onClick={() => {
                setSearchTerm("");
                setMarqueFilter(ALL);
                setTalentFilter(ALL);
                setMoisFilter(ALL);
              }}
              className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-600 hover:bg-slate-200"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-slate-100/80 p-6">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="h-11 w-11 rounded-lg bg-slate-200" />
                  <div className="space-y-2">
                    <div className="h-5 w-40 rounded bg-slate-200" />
                    <div className="h-4 w-24 rounded bg-slate-200" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-24">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Package className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-base font-medium text-slate-900">Aucune collaboration</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-slate-500">
            Aucune collaboration publiée ne correspond à ta recherche.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((collab) => {
            const isExpanded = expanded === collab.id;
            return (
              <div
                key={collab.id}
                className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200/60 transition-all hover:ring-slate-300"
              >
                <div
                  className="flex cursor-pointer flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setExpanded(isExpanded ? null : collab.id)}
                >
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <Building2 className="h-5 w-5 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{collab.marque}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span className="truncate">{collab.talentNom}</span>
                        {collab.datePublication && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(collab.datePublication).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-3">
                    {collab.lienPublication ? (
                      <a
                        href={collab.lienPublication}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Voir la publication
                      </a>
                    ) : collab.isStory ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600">
                        <Eye className="h-3.5 w-3.5" />
                        Story
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        Sans lien
                      </span>
                    )}
                    <ChevronRight
                      className={`h-5 w-5 text-slate-400 transition-transform ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4">
                    {collab.livrables.length > 0 ? (
                      <>
                        <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                          Livrables
                        </h4>
                        <div className="space-y-2">
                          {collab.livrables.map((l, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200/60"
                            >
                              <span className="font-medium text-slate-900">
                                {l.quantite}x {TYPE_LABELS[l.typeContenu] || l.typeContenu}
                              </span>
                              {l.description && (
                                <span className="text-sm text-slate-500">{l.description}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">Aucun livrable renseigné.</p>
                    )}
                    <div className="mt-4 text-xs text-slate-400">Réf. {collab.reference}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
