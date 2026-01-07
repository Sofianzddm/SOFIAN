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
  ArrowRight,
  Loader2,
  Filter,
  Users,
  TrendingUp,
  MessageCircle,
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
  tm: { id: string; prenom: string; nom: string };
  talent: { id: string; prenom: string; nom: string; photo: string | null };
  marque: { id: string; nom: string; secteur: string | null };
  livrables: { typeContenu: string; quantite: number }[];
  _count: { commentaires: number };
}

const STATUTS = [
  { value: "BROUILLON", label: "Brouillon", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock },
  { value: "EN_ATTENTE", label: "En attente", color: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertCircle },
  { value: "EN_DISCUSSION", label: "En discussion", color: "bg-blue-50 text-blue-700 border-blue-200", icon: MessageSquare },
  { value: "VALIDEE", label: "Validée", color: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  { value: "REFUSEE", label: "Refusée", color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  { value: "ANNULEE", label: "Annulée", color: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
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
      nego.marque.nom.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const formatMoney = (amount: number | null) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  };

  const getStatutInfo = (statut: string) => STATUTS.find((s) => s.value === statut) || STATUTS[0];

  const getLivrablesLabel = (livrables: { typeContenu: string; quantite: number }[]) => {
    if (livrables.length === 0) return "-";
    if (livrables.length === 1) {
      const l = livrables[0];
      return l.quantite > 1 ? `${l.quantite}x ${TYPE_LABELS[l.typeContenu] || l.typeContenu}` : TYPE_LABELS[l.typeContenu] || l.typeContenu;
    }
    return `${livrables.reduce((acc, l) => acc + l.quantite, 0)} livrables`;
  };

  // Stats
  const enAttente = negociations.filter((n) => n.statut === "EN_ATTENTE").length;
  const enDiscussion = negociations.filter((n) => n.statut === "EN_DISCUSSION").length;
  const validees = negociations.filter((n) => n.statut === "VALIDEE").length;
  const totalBudget = negociations
    .filter((n) => !["REFUSEE", "ANNULEE"].includes(n.statut))
    .reduce((acc, n) => acc + (Number(n.budgetSouhaite) || Number(n.budgetMarque) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">Négociations</h1>
          <p className="text-gray-500 mt-1">{negociations.length} négociations</p>
        </div>
        <Link
          href="/negociations/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-glowup-licorice text-white font-medium rounded-xl hover:bg-glowup-licorice/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle négo
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">En attente</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{enAttente}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">En discussion</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{enDiscussion}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl">
              <MessageCircle className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Validées</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{validees}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Budget en négo</p>
              <p className="text-2xl font-bold text-glowup-licorice mt-1">{formatMoney(totalBudget)}</p>
            </div>
            <div className="p-3 bg-glowup-lace rounded-xl">
              <TrendingUp className="w-5 h-5 text-glowup-rose" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
            />
          </div>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice appearance-none bg-white text-sm min-w-[150px]"
          >
            <option value="">Tous statuts</option>
            {STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {canSeeAll && (
            <select
              value={filterTm}
              onChange={(e) => setFilterTm(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice appearance-none bg-white text-sm min-w-[150px]"
            >
              <option value="">Tous les TM</option>
              {tms.map((tm) => <option key={tm.id} value={tm.id}>{tm.prenom} {tm.nom}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : filteredNegos.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Aucune négociation</p>
            <Link href="/negociations/new" className="inline-flex items-center gap-2 px-4 py-2 bg-glowup-licorice text-white text-sm font-medium rounded-lg">
              <Plus className="w-4 h-4" />Créer
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Ref</th>
                {canSeeAll && <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">TM</th>}
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Talent</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Marque</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Livrables</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Budget</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredNegos.map((nego) => {
                const statutInfo = getStatutInfo(nego.statut);
                return (
                  <tr key={nego.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-glowup-licorice">{nego.reference}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          nego.source === "INBOUND" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                        }`}>
                          {nego.source === "INBOUND" ? "IN" : "OUT"}
                        </span>
                      </div>
                    </td>
                    {canSeeAll && (
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600">{nego.tm.prenom}</span>
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-glowup-lace flex items-center justify-center text-xs font-semibold text-glowup-rose">
                          {nego.talent.prenom.charAt(0)}
                        </div>
                        <span className="text-sm text-glowup-licorice">{nego.talent.prenom} {nego.talent.nom.charAt(0)}.</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">{nego.marque.nom}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-500">{getLivrablesLabel(nego.livrables)}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-semibold text-glowup-licorice">
                        {formatMoney(nego.budgetSouhaite || nego.budgetMarque)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${statutInfo.color}`}>
                          <statutInfo.icon className="w-3 h-3" />
                          {statutInfo.label}
                        </span>
                        {nego._count.commentaires > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-400">
                            <MessageCircle className="w-3 h-3" />
                            {nego._count.commentaires}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/negociations/${nego.id}`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-glowup-licorice">
                        Voir <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
