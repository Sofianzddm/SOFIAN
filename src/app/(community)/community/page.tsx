"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Calendar,
  Loader2,
  ExternalLink,
  Sparkles,
  Eye,
  Instagram,
  Music2,
  Youtube,
  X,
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

type Platform = { label: string; icon: typeof Instagram; classes: string };

function detectPlatform(url: string | null): Platform {
  const u = (url || "").toLowerCase();
  if (u.includes("instagram"))
    return {
      label: "Instagram",
      icon: Instagram,
      classes: "bg-gradient-to-r from-fuchsia-600 via-pink-600 to-orange-500",
    };
  if (u.includes("tiktok"))
    return { label: "TikTok", icon: Music2, classes: "bg-slate-900" };
  if (u.includes("youtu"))
    return { label: "YouTube", icon: Youtube, classes: "bg-red-600" };
  return { label: "la publication", icon: ExternalLink, classes: "bg-slate-900" };
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function CommunityCollaborationsPage() {
  const [collaborations, setCollaborations] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [marqueFilter, setMarqueFilter] = useState(ALL);
  const [talentFilter, setTalentFilter] = useState(ALL);
  const [moisFilter, setMoisFilter] = useState(ALL);

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
        keys.set(key, d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
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
    marqueFilter !== ALL || talentFilter !== ALL || moisFilter !== ALL || !!searchTerm;

  const selectClass =
    "h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-violet-900 p-8 text-white shadow-xl">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-200">
          <Sparkles className="h-4 w-4" />
          Espace Community
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Publications</h1>
        <p className="mt-1 text-sm text-slate-300">
          {filtered.length} publication{filtered.length > 1 ? "s" : ""}
          {hasActiveFilter ? " · filtré" + (filtered.length > 1 ? "es" : "e") : ""}
        </p>
      </div>

      {/* Recherche + filtres */}
      <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher une marque, un talent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={marqueFilter} onChange={(e) => setMarqueFilter(e.target.value)} className={selectClass}>
            <option value={ALL}>Toutes les marques</option>
            {marques.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select value={talentFilter} onChange={(e) => setTalentFilter(e.target.value)} className={selectClass}>
            <option value={ALL}>Tous les talents</option>
            {talents.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={moisFilter} onChange={(e) => setMoisFilter(e.target.value)} className={selectClass}>
            <option value={ALL}>Tous les mois</option>
            {moisOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearchTerm("");
                setMarqueFilter(ALL);
                setTalentFilter(ALL);
                setMoisFilter(ALL);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-slate-100 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200"
            >
              <X className="h-3.5 w-3.5" />
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse rounded-3xl bg-slate-100/80 p-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-28 rounded bg-slate-200" />
                  <div className="h-3 w-20 rounded bg-slate-200" />
                </div>
              </div>
              <div className="mt-6 h-10 w-full rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 py-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100">
            <Sparkles className="h-7 w-7 text-violet-500" />
          </div>
          <h3 className="text-base font-medium text-slate-900">Aucune publication</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-slate-500">
            Aucune publication ne correspond à ta recherche.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((collab) => {
            const platform = detectPlatform(collab.lienPublication);
            const PlatformIcon = platform.icon;
            const tags = collab.livrables.slice(0, 3);
            const extraTags = collab.livrables.length - tags.length;
            return (
              <div
                key={collab.id}
                className="group flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-slate-300"
              >
                {/* Bandeau */}
                <div className="relative h-24 bg-gradient-to-br from-slate-100 via-slate-50 to-violet-100/60">
                  {collab.isStory && !collab.lienPublication && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-violet-600 backdrop-blur">
                      <Eye className="h-3.5 w-3.5" />
                      Story
                    </span>
                  )}
                  <div className="absolute -bottom-8 left-6">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md ring-4 ring-white">
                      {collab.talentPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={collab.talentPhoto}
                          alt={collab.talentNom}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-semibold text-slate-400">
                          {initials(collab.talentNom)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Corps */}
                <div className="flex flex-1 flex-col px-6 pb-6 pt-10">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{collab.marque}</h3>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{collab.talentNom}</p>

                  {collab.datePublication && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(collab.datePublication).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}

                  {tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {tags.map((l, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                        >
                          {l.quantite > 1 ? `${l.quantite}× ` : ""}
                          {TYPE_LABELS[l.typeContenu] || l.typeContenu}
                        </span>
                      ))}
                      {extraTags > 0 && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">
                          +{extraTags}
                        </span>
                      )}
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-auto pt-6">
                    {collab.lienPublication ? (
                      <a
                        href={collab.lienPublication}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] ${platform.classes}`}
                      >
                        <PlatformIcon className="h-4 w-4" />
                        Voir sur {platform.label}
                      </a>
                    ) : (
                      <div className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-600">
                        <Eye className="h-4 w-4" />
                        Story · sans lien permanent
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
