"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Plus,
  Search,
  MessageSquare,
  Euro,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Loader2,
  Users,
  TrendingUp,
  Building2,
  Sparkles,
} from "lucide-react";

interface Negociation {
  id: string;
  reference: string;
  source: string;
  budgetMarque: number | null;
  budgetSouhaite: number | null;
  budgetFinal: number | null;
  dateDeadline: string | null;
  statut: string;
  createdAt: string;
  lastModifiedAt?: string;
  tm: { id: string; prenom: string; nom: string };
  talent: { id: string; prenom: string; nom: string; photo: string | null };
  marque: { id: string; nom: string; secteur: string | null } | null;
  nomMarqueSaisi?: string | null;
  livrables: { typeContenu: string; quantite: number }[];
  _count: { commentaires: number };
}

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "BROUILLON", label: "Brouillon", dot: "bg-slate-400" },
  { value: "EN_ATTENTE", label: "En attente", dot: "bg-amber-500" },
  { value: "EN_DISCUSSION", label: "En discussion", dot: "bg-blue-500" },
  { value: "VALIDEE", label: "Validée", dot: "bg-emerald-500" },
  { value: "REFUSEE", label: "Refusée", dot: "bg-red-500" },
];

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story", POST: "Post", REEL: "Reel", TIKTOK_VIDEO: "TikTok",
  YOUTUBE_VIDEO: "YouTube", YOUTUBE_SHORT: "Short", EVENT: "Event",
  SHOOTING: "Shooting", AMBASSADEUR: "Ambassadeur",
};

export default function NegociationsPage() {
  const { data: session } = useSession();
  const [negociations, setNegociations] = useState<Negociation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterTm, setFilterTm] = useState("");
  const [tms, setTms] = useState<{ id: string; prenom: string; nom: string }[]>([]);

  const isAdmin = session?.user?.role === "ADMIN";
  const isHeadOf = session?.user?.role === "HEAD_OF";
  const canSeeAll = isAdmin || isHeadOf;

  useEffect(() => {
    fetchNegociations();
    if (canSeeAll) fetchTms();
  }, [filterStatut, filterTm]);

  const fetchNegociations = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatut) params.set("statut", filterStatut);
      if (filterTm) params.set("tmId", filterTm);
      const res = await fetch(`/api/negociations?${params}`);
      setNegociations(await res.json());
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTms = async () => {
    try {
      const res = await fetch("/api/users?role=TM");
      if (res.ok) setTms(await res.json());
    } catch (error) {
      console.error("Erreur:", error);
    }
  };

  const filteredNegos = negociations.filter((nego) => {
    const matchSearch =
      nego.reference.toLowerCase().includes(search.toLowerCase()) ||
      `${nego.talent.prenom} ${nego.talent.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      (nego.nomMarqueSaisi || nego.marque?.nom || "").toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const formatMoney = (amount: number | null) => {
    if (!amount) return "—";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  };

  const getStatutConfig = (statut: string) => {
    const config: Record<string, { label: string; className: string }> = {
      BROUILLON: { label: "Brouillon", className: "bg-slate-100 text-slate-600" },
      EN_ATTENTE: { label: "En attente", className: "bg-amber-500/10 text-amber-600" },
      EN_DISCUSSION: { label: "En discussion", className: "bg-blue-500/10 text-blue-600" },
      VALIDEE: { label: "Validée", className: "bg-emerald-500/10 text-emerald-600" },
      REFUSEE: { label: "Refusée", className: "bg-red-500/10 text-red-600" },
      ANNULEE: { label: "Annulée", className: "bg-slate-100 text-slate-500" },
    };
    return config[statut] || { label: statut, className: "bg-slate-100 text-slate-600" };
  };

  const getLivrablesLabel = (livrables: { typeContenu: string; quantite: number }[]) => {
    if (livrables.length === 0) return "—";
    if (livrables.length === 1) {
      const l = livrables[0];
      return l.quantite > 1 ? `${l.quantite}x ${TYPE_LABELS[l.typeContenu] || l.typeContenu}` : TYPE_LABELS[l.typeContenu] || l.typeContenu;
    }
    return `${livrables.reduce((acc, l) => acc + l.quantite, 0)} livrables`;
  };

  const enAttente = negociations.filter((n) => n.statut === "EN_ATTENTE").length;
  const enDiscussion = negociations.filter((n) => n.statut === "EN_DISCUSSION").length;
  const validees = negociations.filter((n) => n.statut === "VALIDEE").length;
  const totalBudget = negociations
    .filter((n) => !["REFUSEE", "ANNULEE"].includes(n.statut))
    .reduce((acc, n) => acc + (Number(n.budgetSouhaite) || Number(n.budgetMarque) || 0), 0);

  const cinqJoursMs = 5 * 24 * 60 * 60 * 1000;
  const sansReponse = filteredNegos.filter(
    (n) => ["EN_ATTENTE", "EN_DISCUSSION"].includes(n.statut) &&
    n.lastModifiedAt && new Date(n.lastModifiedAt).getTime() < Date.now() - cinqJoursMs
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Négociations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {negociations.length} négociation{negociations.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/negociations/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouvelle négociation
        </Link>
      </div>

      {/* Stats - 4 carrés sympas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{enAttente}</p>
          <p className="text-sm text-slate-500">En attente</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <MessageSquare className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{enDiscussion}</p>
          <p className="text-sm text-slate-500">En discussion</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{validees}</p>
          <p className="text-sm text-slate-500">Validées</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-glowup-rose/10">
              <TrendingUp className="h-4 w-4 text-glowup-rose" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatMoney(totalBudget)}</p>
          <p className="text-sm text-slate-500">Budget en négo (HT)</p>
        </div>
      </div>

      {/* Barre recherche + filtres */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher talent, marque, référence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border-0 bg-slate-50 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUTS.map((s) => (
            <button
              key={s.value || "all"}
              onClick={() => setFilterStatut(s.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                filterStatut === s.value
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {s.label}
            </button>
          ))}
          {canSeeAll && (
            <select
              value={filterTm}
              onChange={(e) => setFilterTm(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Tous les TM</option>
              {tms.map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.prenom} {tm.nom}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Liste - cartes */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-glowup-rose" />
          <p className="text-sm text-slate-500">Chargement...</p>
        </div>
      ) : filteredNegos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-24 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <Sparkles className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Aucune négociation</h3>
          <p className="mt-2 max-w-sm mx-auto text-sm text-slate-500">
            Crée ta première négociation pour lancer une collaboration avec une marque.
          </p>
          <Link
            href="/negociations/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Nouvelle négociation
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNegos.map((nego) => {
            const statut = getStatutConfig(nego.statut);
            const isSansReponse = sansReponse.some((s) => s.id === nego.id);
            const joursSansReponse = nego.lastModifiedAt
              ? Math.floor((Date.now() - new Date(nego.lastModifiedAt).getTime()) / (24 * 60 * 60 * 1000))
              : 0;

            return (
              <Link
                key={nego.id}
                href={`/negociations/${nego.id}`}
                className={`group flex items-center justify-between gap-4 rounded-xl border bg-white p-5 transition-all hover:shadow-md ${
                  isSansReponse ? "border-amber-200 ring-1 ring-amber-200/50" : "border-slate-200 ring-1 ring-slate-200/60"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-glowup-rose/20 to-pink-100">
                    {nego.talent.photo ? (
                      <img src={nego.talent.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-glowup-rose">
                        {nego.talent.prenom.charAt(0)}{nego.talent.nom.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 truncate">
                        {nego.talent.prenom} {nego.talent.nom} × {nego.nomMarqueSaisi || nego.marque?.nom || "—"}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statut.className}`}>
                        {statut.label}
                      </span>
                      {nego.source === "INBOUND" && (
                        <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">IN</span>
                      )}
                      {isSansReponse && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {joursSansReponse}j sans réponse
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                      <span className="font-mono text-slate-400">{nego.reference}</span>
                      <span>{getLivrablesLabel(nego.livrables)}</span>
                      {canSeeAll && <span>{nego.tm.prenom} {nego.tm.nom}</span>}
                      {nego._count.commentaires > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {nego._count.commentaires}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-4">
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">
                    {formatMoney(nego.budgetSouhaite || nego.budgetMarque)}
                  </span>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
