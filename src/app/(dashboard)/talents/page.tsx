"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Instagram,
  Music2,
  Eye,
  Pencil,
  Trash2,
  Users,
  Loader2,
  AlertTriangle,
  Archive,
  GripVertical,
  BookOpen,
  X,
  Camera,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  TYPE_PEAU_OPTIONS,
  TYPE_CHEVEUX_OPTIONS,
  COULEUR_CHEVEUX_OPTIONS,
  TENDANCE_PEAU_OPTIONS,
  TENDANCE_CHEVEUX_OPTIONS,
} from "@/lib/talent-attributes";

// Types
interface Talent {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  photo: string | null;
  instagram: string | null;
  tiktok: string | null;
  niches: string[];
  ville: string | null;
  typePeau: string | null;
  typeCheveux: string | null;
  couleurCheveux: string | null;
  tendancePeau: string[] | null;
  tendanceCheveux: string[] | null;
  commissionInbound: number;
  commissionOutbound: number;
  orderBook?: number;
  manager: {
    prenom: string;
    nom: string;
  };
  stats: {
    igFollowers: number | null;
    ttFollowers: number | null;
  } | null;
  _count: {
    collaborations: number;
  };
  delegations?: {
    tmOrigine: {
      prenom: string;
      nom: string;
    };
    tmRelaiId: string;
    actif: boolean;
  }[];
}

export default function TalentsPage() {
  const { data: session } = useSession();
  const [talents, setTalents] = useState<Talent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNiche, setFilterNiche] = useState("");
  const [filterVille, setFilterVille] = useState("");
  const [filterPeau, setFilterPeau] = useState("");
  const [filterCheveux, setFilterCheveux] = useState("");
  const [filterCouleur, setFilterCouleur] = useState("");
  const [filterTendancePeau, setFilterTendancePeau] = useState("");
  const [filterTendanceCheveux, setFilterTendanceCheveux] = useState("");
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);

  // Rôle effectif (via /api/auth/me) pour cohérence avec impersonation
  const user = session?.user as { id: string; role: string; name: string } | undefined;
  const role = effectiveRole ?? user?.role ?? "";
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const r = await fetch("/api/auth/me");
        if (r.ok) {
          const data = await r.json();
          setEffectiveRole(data.role ?? null);
        }
      } catch {
        setEffectiveRole(null);
      }
    };
    fetchMe();
  }, []);

  // Permissions basées sur le rôle effectif
  const canAddTalent = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canEditTalent = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canDeleteTalent = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canArchiveTalent = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canReorderBook = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";

  const [showBookOrderModal, setShowBookOrderModal] = useState(false);
  const [bookOrderList, setBookOrderList] = useState<Talent[]>([]);
  const [savingBookOrder, setSavingBookOrder] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Bulk import Instagram photos (ADMIN)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkCancel, setBulkCancel] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
    done: { id: string; name: string; ok: boolean; error?: string; count?: number }[];
  }>({ current: 0, total: 0, currentName: "", done: [] });

  useEffect(() => {
    fetchTalents();
  }, []);

  useEffect(() => {
    if (showBookOrderModal && talents.length > 0) {
      const sorted = [...talents].sort((a, b) => {
        const oA = a.orderBook ?? 999999;
        const oB = b.orderBook ?? 999999;
        if (oA !== oB) return oA - oB;
        return `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`);
      });
      setBookOrderList(sorted);
    }
  }, [showBookOrderModal, talents]);

  const fetchTalents = async () => {
    try {
      const res = await fetch("/api/talents");
      const data = await res.json();
      setTalents(data);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  // Liste des talents éligibles à l'import bulk (handle Instagram renseigné).
  const bulkEligible = talents.filter((t) => !!t.instagram);

  const runBulkInstagramImport = async () => {
    if (bulkRunning) return;
    setBulkRunning(true);
    setBulkCancel(false);
    setBulkProgress({
      current: 0,
      total: bulkEligible.length,
      currentName: "",
      done: [],
    });

    for (let i = 0; i < bulkEligible.length; i++) {
      if (bulkCancel) break;
      const t = bulkEligible[i];
      const name = `${t.prenom} ${t.nom}`;
      setBulkProgress((p) => ({ ...p, current: i + 1, currentName: name }));

      try {
        const res = await fetch(`/api/talents/${t.id}/instagram-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overwrite: bulkOverwrite }),
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!res.ok) {
          setBulkProgress((p) => ({
            ...p,
            done: [
              ...p.done,
              {
                id: t.id,
                name,
                ok: false,
                error:
                  (data.error as string | undefined) ??
                  `Erreur ${res.status}`,
              },
            ],
          }));
        } else {
          setBulkProgress((p) => ({
            ...p,
            done: [
              ...p.done,
              {
                id: t.id,
                name,
                ok: true,
                count:
                  typeof data.imported === "number"
                    ? (data.imported as number)
                    : undefined,
              },
            ],
          }));
        }
      } catch (e) {
        setBulkProgress((p) => ({
          ...p,
          done: [
            ...p.done,
            {
              id: t.id,
              name,
              ok: false,
              error: e instanceof Error ? e.message : "Erreur réseau",
            },
          ],
        }));
      }
    }

    setBulkRunning(false);
    setBulkProgress((p) => ({ ...p, currentName: "" }));
  };

  const isTm = (role === "TM" || role === "HEAD_OF_INFLUENCE") && !!user?.id;
  const activeTabFromQuery = searchParams.get("tab") === "delegation" ? "delegation" : "mine";
  const [activeTab, setActiveTab] = useState<"mine" | "delegation">(activeTabFromQuery);

  useEffect(() => {
    setActiveTab(activeTabFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabFromQuery]);

  const isTalentDeleguePourMoi = (talent: Talent) => {
    if (!isTm || !user?.id || !talent.delegations) return false;
    return talent.delegations.some(
      (d) => d.actif && d.tmRelaiId === user.id
    );
  };

  const filteredTalents = talents.filter((talent) => {
    const matchSearch =
      `${talent.prenom} ${talent.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      talent.email.toLowerCase().includes(search.toLowerCase());
    const matchNiche = !filterNiche || talent.niches.includes(filterNiche);
    const matchVille =
      !filterVille ||
      (talent.ville || "").toLowerCase().includes(filterVille.toLowerCase());
    const matchPeau = !filterPeau || talent.typePeau === filterPeau;
    const matchCheveux = !filterCheveux || talent.typeCheveux === filterCheveux;
    const matchCouleur = !filterCouleur || talent.couleurCheveux === filterCouleur;
    const matchTendancePeau =
      !filterTendancePeau || !!talent.tendancePeau?.includes(filterTendancePeau);
    const matchTendanceCheveux =
      !filterTendanceCheveux ||
      !!talent.tendanceCheveux?.includes(filterTendanceCheveux);
    if (
      !matchSearch ||
      !matchNiche ||
      !matchVille ||
      !matchPeau ||
      !matchCheveux ||
      !matchCouleur ||
      !matchTendancePeau ||
      !matchTendanceCheveux
    )
      return false;

    if (!isTm) return true;

    if (activeTab === "mine") {
      return !isTalentDeleguePourMoi(talent);
    }
    // delegation tab
    return isTalentDeleguePourMoi(talent);
  });

  const delegationTalents = talents.filter((t) => isTalentDeleguePourMoi(t));
  const allNiches = [...new Set(talents.flatMap((t) => t.niches))];
  const allVilles = [
    ...new Set(
      talents.map((t) => (t.ville || "").trim()).filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const activeFilterCount = [
    filterNiche,
    filterVille,
    filterPeau,
    filterCheveux,
    filterCouleur,
    filterTendancePeau,
    filterTendanceCheveux,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setFilterNiche("");
    setFilterVille("");
    setFilterPeau("");
    setFilterCheveux("");
    setFilterCouleur("");
    setFilterTendancePeau("");
    setFilterTendanceCheveux("");
  };

  const formatFollowers = (count: number | null) => {
    if (!count) return "-";
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  // Titre dynamique selon le rôle
  const getPageTitle = () => {
    if (role === "TM" || role === "HEAD_OF_INFLUENCE") return "Mes talents";
    return "Talents";
  };

  const getPageSubtitle = () => {
    if (role === "TM" || role === "HEAD_OF_INFLUENCE") {
      return `${talents.length} talent(s) sous ma gestion ou en relai`;
    }
    return `${talents.length} talents dans l'agence`;
  };

  const getDelegationBadge = (talent: Talent) => {
    if ((role !== "TM" && role !== "HEAD_OF_INFLUENCE") || !user?.id || !talent.delegations) return null;
    const activeDelegation = talent.delegations.find(
      (d) => d.actif && d.tmRelaiId === user.id
    );
    if (!activeDelegation) return null;
    const originName = `${activeDelegation.tmOrigine.prenom} ${activeDelegation.tmOrigine.nom}`.trim();
    return (
      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-[#F5EBE0] text-[#C08B8B] border border-[#C08B8B] font-medium mt-0.5">
        Relai · {originName}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">{getPageTitle()}</h1>
          <p className="text-gray-500 mt-1">{getPageSubtitle()}</p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Import bulk photos Instagram — ADMIN uniquement */}
          {role === "ADMIN" && (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] text-white rounded-lg hover:opacity-90 transition-opacity shadow-sm"
              title="Importer en masse les photos Instagram des talents (kit media)"
            >
              <Camera className="w-4 h-4" />
              Photos Insta · tous
            </button>
          )}
          {/* Ordre du book - ADMIN et HEAD_OF uniquement (pas Head of Influence) */}
          {canReorderBook && (
            <button
              type="button"
              onClick={() => setShowBookOrderModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Ordre du book
            </button>
          )}
          {/* Bouton Nouveau talent - ADMIN et HEAD_OF uniquement */}
          {canAddTalent && (
            <Link
              href="/talents/new"
              className="flex items-center gap-2 px-4 py-2 bg-glowup-rose text-white rounded-lg hover:bg-glowup-rose/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouveau talent
            </Link>
          )}
        </div>
      </div>

      {isTm && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("mine")}
            className={`px-4 py-2 rounded-full text-sm font-medium border ${
              activeTab === "mine"
                ? "bg-[#1A1110] text-white border-[#1A1110]"
                : "bg-transparent text-[#1A1110] border-[#1A1110]"
            }`}
          >
            Mes talents ({talents.filter((t) => !isTalentDeleguePourMoi(t)).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("delegation")}
            className={`px-4 py-2 rounded-full text-sm font-medium border ${
              activeTab === "delegation"
                ? "bg-[#1A1110] text-white border-[#1A1110]"
                : "bg-transparent text-[#1A1110] border-[#1A1110]"
            }`}
          >
            En délégation ({talents.filter((t) => isTalentDeleguePourMoi(t)).length})
          </button>
        </div>
      )}

      {/* Header premium pour l'onglet En délégation */}
      {activeTab === "delegation" && isTm && delegationTalents.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 mb-4 flex items-center gap-3"
          style={{ background: "#F5EBE0", border: "1px solid #C08B8B" }}
        >
          <span className="text-lg">🎯</span>
          <p className="text-sm" style={{ color: "#1A1110" }}>
            <strong style={{ fontFamily: "Spectral, serif" }}>Relai en cours</strong>
            {" "}— Ces talents te sont confiés temporairement. Traite-les exactement comme les tiens.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un talent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
            />
          </div>

          {/* Filter by niche */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={filterNiche}
              onChange={(e) => setFilterNiche(e.target.value)}
              className="pl-10 pr-8 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
            >
              <option value="">Toutes les niches</option>
              {allNiches.map((niche) => (
                <option key={niche} value={niche}>
                  {niche}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtres avancés : ville + apparence (peau / cheveux) */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Ville
            </label>
            <input
              type="text"
              list="talents-villes"
              placeholder="Toutes les villes"
              value={filterVille}
              onChange={(e) => setFilterVille(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 bg-white"
            />
            <datalist id="talents-villes">
              {allVilles.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Type de peau
            </label>
            <select
              value={filterPeau}
              onChange={(e) => setFilterPeau(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
            >
              <option value="">Toutes</option>
              {TYPE_PEAU_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Type de cheveux
            </label>
            <select
              value={filterCheveux}
              onChange={(e) => setFilterCheveux(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
            >
              <option value="">Tous</option>
              {TYPE_CHEVEUX_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Couleur de cheveux
            </label>
            <select
              value={filterCouleur}
              onChange={(e) => setFilterCouleur(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
            >
              <option value="">Toutes</option>
              {COULEUR_CHEVEUX_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Tendance de peau
            </label>
            <select
              value={filterTendancePeau}
              onChange={(e) => setFilterTendancePeau(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
            >
              <option value="">Toutes</option>
              {TENDANCE_PEAU_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Tendance des cheveux
            </label>
            <select
              value={filterTendanceCheveux}
              onChange={(e) => setFilterTendanceCheveux(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
            >
              <option value="">Toutes</option>
              {TENDANCE_CHEVEUX_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-glowup-rose hover:bg-glowup-lace rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Réinitialiser ({activeFilterCount})
            </button>
          )}
        </div>

        {activeFilterCount > 0 && (
          <p className="mt-3 text-sm text-gray-500">
            {filteredTalents.length} talent{filteredTalents.length > 1 ? "s" : ""} correspond
            {filteredTalents.length > 1 ? "ent" : ""} aux filtres
          </p>
        )}
      </div>

      {/* Table / Etat vide selon onglet */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-glowup-rose mb-3" />
            <p>Chargement...</p>
          </div>
        ) : filteredTalents.length === 0 && isTm && activeTab === "delegation" ? (
          <div className="text-center py-16 text-[#C08B8B]">
            <p className="text-4xl mb-3">🤝</p>
            <p className="font-medium text-[#1A1110]">Aucune délégation en cours</p>
            <p className="text-sm mt-1">
              Un admin peut te confier des talents d&apos;une TM absente depuis la page Délégations.
            </p>
          </div>
        ) : filteredTalents.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucun talent trouvé</p>
            {role === "TM" && talents.length === 0 && (
              <p className="text-gray-400 text-sm mt-2">
                Contactez votre Head of pour être assigné à des talents
              </p>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Talent
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Réseaux
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Niches
                </th>
                {/* Colonne Manager - masquée pour TM (ils ne voient que leurs talents) */}
                {role !== "TM" && (
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                    Manager
                  </th>
                )}
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Commission
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Collabs
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {activeTab === "delegation" && isTm
                ? // Groupement par TM absente pour l'onglet délégation
                  Object.entries(
                    filteredTalents.reduce((acc, talent) => {
                      const delegation = talent.delegations?.find(
                        (d) => d.actif && d.tmRelaiId === user?.id
                      );
                      const key = delegation
                        ? `${delegation.tmOrigine.prenom} ${delegation.tmOrigine.nom}`
                        : "Autres";
                      if (!acc[key]) acc[key] = [] as Talent[];
                      acc[key].push(talent);
                      return acc;
                    }, {} as Record<string, Talent[]>)
                  ).flatMap(([tmNom, groupTalents]) => (
                    <React.Fragment key={tmNom}>
                      <tr>
                        <td colSpan={7}>
                          <div className="flex items-center gap-3 py-3 px-4">
                            <div
                              className="flex-1 h-px"
                              style={{ background: "#C08B8B", opacity: 0.3 }}
                            />
                            <span
                              className="text-xs italic flex items-center gap-1.5"
                              style={{ color: "#C08B8B", fontFamily: "Spectral, serif" }}
                            >
                              <span>🏖️</span> Talents de {tmNom}
                            </span>
                            <div
                              className="flex-1 h-px"
                              style={{ background: "#C08B8B", opacity: 0.3 }}
                            />
                          </div>
                        </td>
                      </tr>
                      {groupTalents.map((talent) => (
                        <tr
                          key={talent.id}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                        >
                          {/* Talent info */}
                          <td className="py-3 px-4">
                            <Link
                              href={`/talents/${talent.id}`}
                              className="flex items-center gap-3 group"
                            >
                              <div className="w-10 h-10 rounded-full bg-glowup-lace flex items-center justify-center overflow-hidden">
                                {talent.photo ? (
                                  <img
                                    src={talent.photo}
                                    alt={talent.prenom}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-sm font-semibold text-glowup-rose">
                                    {talent.prenom.charAt(0)}
                                    {talent.nom.charAt(0)}
                                  </span>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-glowup-licorice group-hover:text-glowup-rose transition-colors">
                                  {talent.prenom} {talent.nom}
                                </p>
                                <p className="text-sm text-gray-500">{talent.email}</p>
                                {getDelegationBadge(talent)}
                              </div>
                            </Link>
                          </td>
                          {/* Réseaux */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {talent.instagram && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Instagram className="w-4 h-4 text-pink-500" />
                                  <span className="text-gray-600">
                                    {formatFollowers(talent.stats?.igFollowers || null)}
                                  </span>
                                </div>
                              )}
                              {talent.tiktok && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Music2 className="w-4 h-4 text-gray-800" />
                                  <span className="text-gray-600">
                                    {formatFollowers(talent.stats?.ttFollowers || null)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          {/* Niches */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {talent.niches.slice(0, 2).map((niche) => (
                                <span
                                  key={niche}
                                  className="px-2 py-0.5 text-xs rounded-full bg-glowup-lace text-glowup-licorice"
                                >
                                  {niche}
                                </span>
                              ))}
                              {talent.niches.length > 2 && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">
                                  +{talent.niches.length - 2}
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Manager - masqué pour TM */}
                          {role !== "TM" && (
                            <td className="py-3 px-4">
                              <span className="text-sm text-gray-600">
                                {talent.manager.prenom} {talent.manager.nom.charAt(0)}.
                              </span>
                            </td>
                          )}
                          {/* Commission */}
                          <td className="py-3 px-4">
                            <div className="text-sm">
                              <span className="text-gray-600">In: </span>
                              <span className="font-medium text-glowup-licorice">
                                {talent.commissionInbound}%
                              </span>
                              <span className="text-gray-400 mx-1">|</span>
                              <span className="text-gray-600">Out: </span>
                              <span className="font-medium text-glowup-licorice">
                                {talent.commissionOutbound}%
                              </span>
                            </div>
                          </td>
                          {/* Collabs */}
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-600">
                              {talent._count.collaborations}
                            </span>
                          </td>
                          {/* Actions */}
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={`/talents/${talent.id}`}
                                className="p-2 text-gray-400 hover:text-glowup-rose hover:bg-glowup-lace rounded-lg transition-colors"
                                title="Voir"
                              >
                                <Eye className="w-4 h-4" />
                              </Link>
                              {canEditTalent && (
                                <Link
                                  href={`/talents/${talent.id}/edit`}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Modifier"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Link>
                              )}
                              {canArchiveTalent && (
                                <button
                                  className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                  title="Archiver (ne plus afficher le talent)"
                                  onClick={async () => {
                                    const confirmMessage = `Archiver ${talent.prenom} ${talent.nom} ?\n\nLe talent ne sera plus visible dans le dashboard, les partenaires, le talentbook…\nLes collaborations et négociations existantes seront conservées en historique.`;

                                    if (!confirm(confirmMessage)) return;

                                    try {
                                      const res = await fetch(`/api/talents/${talent.id}`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ isArchived: true }),
                                      });

                                      const data = await res.json();

                                      if (!res.ok) {
                                        alert(
                                          `❌ ${data.error || "Impossible d'archiver ce talent"}`
                                        );
                                        return;
                                      }

                                      alert(
                                        `✅ ${talent.prenom} ${talent.nom} a été archivé (il n'apparaîtra plus nulle part).`
                                      );
                                      fetchTalents();
                                    } catch (error) {
                                      console.error("Erreur archivage:", error);
                                      alert(
                                        "❌ Erreur lors de l'archivage. Veuillez réessayer."
                                      );
                                    }
                                  }}
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                : filteredTalents.map((talent) => (
                <tr
                  key={talent.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Talent info */}
                  <td className="py-3 px-4">
                    <Link href={`/talents/${talent.id}`} className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-full bg-glowup-lace flex items-center justify-center overflow-hidden">
                        {talent.photo ? (
                          <img
                            src={talent.photo}
                            alt={talent.prenom}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-glowup-rose">
                            {talent.prenom.charAt(0)}
                            {talent.nom.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-glowup-licorice group-hover:text-glowup-rose transition-colors">
                          {talent.prenom} {talent.nom}
                        </p>
                        <p className="text-sm text-gray-500">{talent.email}</p>
                        {getDelegationBadge(talent)}
                      </div>
                    </Link>
                  </td>

                  {/* Réseaux */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {talent.instagram && (
                        <div className="flex items-center gap-1 text-sm">
                          <Instagram className="w-4 h-4 text-pink-500" />
                          <span className="text-gray-600">
                            {formatFollowers(talent.stats?.igFollowers || null)}
                          </span>
                        </div>
                      )}
                      {talent.tiktok && (
                        <div className="flex items-center gap-1 text-sm">
                          <Music2 className="w-4 h-4 text-gray-800" />
                          <span className="text-gray-600">
                            {formatFollowers(talent.stats?.ttFollowers || null)}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Niches */}
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {talent.niches.slice(0, 2).map((niche) => (
                        <span
                          key={niche}
                          className="px-2 py-0.5 text-xs rounded-full bg-glowup-lace text-glowup-licorice"
                        >
                          {niche}
                        </span>
                      ))}
                      {talent.niches.length > 2 && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">
                          +{talent.niches.length - 2}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Manager - masqué pour TM */}
                  {role !== "TM" && (
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">
                        {talent.manager.prenom} {talent.manager.nom.charAt(0)}.
                      </span>
                    </td>
                  )}

                  {/* Commission */}
                  <td className="py-3 px-4">
                    <div className="text-sm">
                      <span className="text-gray-600">In: </span>
                      <span className="font-medium text-glowup-licorice">{talent.commissionInbound}%</span>
                      <span className="text-gray-400 mx-1">|</span>
                      <span className="text-gray-600">Out: </span>
                      <span className="font-medium text-glowup-licorice">{talent.commissionOutbound}%</span>
                    </div>
                  </td>

                  {/* Collabs */}
                  <td className="py-3 px-4">
                    <span className="text-sm text-gray-600">
                      {talent._count.collaborations}
                    </span>
                  </td>

                  {/* Actions - selon le rôle */}
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      {/* Voir - tout le monde */}
                      <Link
                        href={`/talents/${talent.id}`}
                        className="p-2 text-gray-400 hover:text-glowup-rose hover:bg-glowup-lace rounded-lg transition-colors"
                        title="Voir"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      
                      {/* Modifier - ADMIN et HEAD_OF uniquement */}
                      {canEditTalent && (
                        <Link
                          href={`/talents/${talent.id}/edit`}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                      )}
                      
                      {/* Archiver - ADMIN et HEAD_OF : masque partout sans tout casser */}
                      {canArchiveTalent && (
                        <button
                          className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Archiver (ne plus afficher le talent)"
                          onClick={async () => {
                            const confirmMessage = `Archiver ${talent.prenom} ${talent.nom} ?\n\nLe talent ne sera plus visible dans le dashboard, les partenaires, le talentbook…\nLes collaborations et négociations existantes seront conservées en historique.`;
                            
                            if (!confirm(confirmMessage)) return;

                            try {
                              const res = await fetch(`/api/talents/${talent.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ isArchived: true }),
                              });

                              const data = await res.json();

                              if (!res.ok) {
                                alert(`❌ Erreur : ${data.error || "Impossible d'archiver ce talent"}`);
                                return;
                              }

                              alert(`✅ ${talent.prenom} ${talent.nom} a été archivé (il n'apparaîtra plus nulle part).`);
                              fetchTalents();
                            } catch (error) {
                              console.error("Erreur archivage:", error);
                              alert("❌ Erreur lors de l'archivage. Veuillez réessayer.");
                            }
                          }}
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      
                      {/* Supprimer - ADMIN uniquement */}
                      {canDeleteTalent && (
                        <button
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                          onClick={async () => {
                            const confirmMessage = `⚠️ ATTENTION : Êtes-vous sûr de vouloir supprimer ${talent.prenom} ${talent.nom} ?\n\nCette action est irréversible.\n\nNote : Si ce talent a des collaborations associées, la suppression sera refusée.`;
                            
                            if (!confirm(confirmMessage)) return;

                            try {
                              const res = await fetch(`/api/talents/${talent.id}`, {
                                method: "DELETE",
                              });

                              const data = await res.json();

                              if (!res.ok) {
                                alert(`❌ Erreur : ${data.error || "Impossible de supprimer ce talent"}`);
                                return;
                              }

                              alert(`✅ ${talent.prenom} ${talent.nom} a été supprimé avec succès`);
                              fetchTalents(); // Recharger la liste
                            } catch (error) {
                              console.error("Erreur suppression:", error);
                              alert("❌ Erreur lors de la suppression. Veuillez réessayer.");
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modale Bulk Instagram Import — ADMIN */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            if (!bulkRunning) setBulkOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold text-glowup-licorice flex items-center gap-2">
                  <Instagram className="w-5 h-5 text-pink-500" />
                  Importer les photos Instagram
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Remplit les 9 premiers slots du Kit Media des talents
                </p>
              </div>
              <button
                type="button"
                disabled={bulkRunning}
                onClick={() => setBulkOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {/* Pré-run : choix + confirmation */}
              {!bulkRunning && bulkProgress.done.length === 0 && (
                <>
                  <p className="text-sm text-gray-700 mb-4">
                    <strong>{bulkEligible.length}</strong> talent(s) avec un
                    handle Instagram seront traités. Chaque import prend
                    environ <strong>20 à 40 secondes</strong> (scraping Apify +
                    upload Cloudinary).
                  </p>

                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={bulkOverwrite}
                      onChange={(e) => setBulkOverwrite(e.target.checked)}
                      className="mt-0.5 accent-pink-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-glowup-licorice">
                        Remplacer les photos existantes
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Par défaut, seuls les slots vides sont remplis (les
                        photos déjà mises manuellement sont conservées).
                      </p>
                    </div>
                  </label>

                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Garde cet onglet ouvert pendant toute la durée du
                      traitement (
                      {Math.ceil((bulkEligible.length * 30) / 60)} min environ).
                      Tu peux annuler à tout moment, les talents déjà traités
                      restent enregistrés.
                    </p>
                  </div>
                </>
              )}

              {/* En cours */}
              {bulkRunning && (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                      <span>
                        {bulkProgress.current} / {bulkProgress.total}
                      </span>
                      <span className="text-pink-600 font-medium">
                        {Math.round(
                          (bulkProgress.current / Math.max(1, bulkProgress.total)) *
                            100
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] transition-all"
                        style={{
                          width: `${
                            (bulkProgress.current /
                              Math.max(1, bulkProgress.total)) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    {bulkProgress.currentName && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        En cours&nbsp;: {bulkProgress.currentName}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Résultats (en cours ou terminé) */}
              {bulkProgress.done.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {bulkProgress.done.map((d) => (
                    <div
                      key={d.id}
                      className={`flex items-start gap-2 text-sm p-2 rounded-lg ${
                        d.ok ? "bg-emerald-50" : "bg-red-50"
                      }`}
                    >
                      {d.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`font-medium truncate ${
                            d.ok ? "text-emerald-800" : "text-red-800"
                          }`}
                        >
                          {d.name}
                        </p>
                        {d.ok ? (
                          <p className="text-xs text-emerald-700">
                            {typeof d.count === "number"
                              ? `${d.count} photo(s) importée(s)`
                              : "OK"}
                          </p>
                        ) : (
                          <p className="text-xs text-red-700 truncate">
                            {d.error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Récap final */}
              {!bulkRunning && bulkProgress.done.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700">
                  <strong>{bulkProgress.done.filter((d) => d.ok).length}</strong>{" "}
                  succès ·{" "}
                  <strong>{bulkProgress.done.filter((d) => !d.ok).length}</strong>{" "}
                  échec(s) sur {bulkProgress.done.length} talent(s).
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t">
              {/* Actions selon l'état */}
              {!bulkRunning && bulkProgress.done.length === 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setBulkOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={bulkEligible.length === 0}
                    onClick={runBulkInstagramImport}
                    className="px-4 py-2 bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    Lancer pour {bulkEligible.length} talent(s)
                  </button>
                </>
              )}

              {bulkRunning && (
                <button
                  type="button"
                  onClick={() => setBulkCancel(true)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium"
                >
                  Arrêter après ce talent
                </button>
              )}

              {!bulkRunning && bulkProgress.done.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setBulkOpen(false);
                    setBulkProgress({
                      current: 0,
                      total: 0,
                      currentName: "",
                      done: [],
                    });
                    fetchTalents();
                  }}
                  className="px-4 py-2 bg-glowup-rose text-white rounded-lg hover:bg-glowup-rose/90 font-medium"
                >
                  Terminer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale Ordre du book */}
      {showBookOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-glowup-licorice">
                Ordre d'affichage dans le talent book
              </h2>
              <button
                type="button"
                onClick={() => setShowBookOrderModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 px-4 pb-2">
              Glissez-déposez les lignes pour modifier l'ordre. Le premier de la
              liste s'affichera en premier sur le book public.
            </p>
            <ul className="overflow-y-auto flex-1 p-4 space-y-1">
              {bookOrderList.map((talent, index) => (
                <li
                  key={talent.id}
                  draggable
                  onDragStart={() => setDraggedIndex(index)}
                  onDragEnd={() => setDraggedIndex(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("ring-2", "ring-glowup-rose/50");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("ring-2", "ring-glowup-rose/50");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-2", "ring-glowup-rose/50");
                    if (draggedIndex === null) return;
                    const from = draggedIndex;
                    const to = index;
                    if (from === to) return;
                    const next = [...bookOrderList];
                    const [removed] = next.splice(from, 1);
                    next.splice(to, 0, removed);
                    setBookOrderList(next);
                    setDraggedIndex(null);
                  }}
                  className={`flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 border border-gray-100 cursor-grab active:cursor-grabbing transition-shadow ${
                    draggedIndex === index ? "opacity-50 shadow-lg" : ""
                  }`}
                >
                  <span className="text-gray-400 touch-none" aria-hidden>
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <div className="w-9 h-9 rounded-full bg-glowup-lace overflow-hidden flex-shrink-0">
                    {talent.photo ? (
                      <img
                        src={talent.photo}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-glowup-rose">
                        {talent.prenom.charAt(0)}
                        {talent.nom.charAt(0)}
                      </span>
                    )}
                  </div>
                  <span className="flex-1 font-medium text-glowup-licorice truncate">
                    {talent.prenom} {talent.nom}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2 p-4 border-t">
              <button
                type="button"
                onClick={() => setShowBookOrderModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={savingBookOrder}
                onClick={async () => {
                  setSavingBookOrder(true);
                  try {
                    const res = await fetch("/api/talents/book-order", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        talentIds: bookOrderList.map((t) => t.id),
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      alert(data.error || "Erreur lors de l'enregistrement");
                      return;
                    }
                    setShowBookOrderModal(false);
                    fetchTalents();
                  } catch (e) {
                    console.error(e);
                    alert("Erreur réseau");
                  } finally {
                    setSavingBookOrder(false);
                  }
                }}
                className="px-4 py-2 bg-glowup-rose text-white rounded-lg hover:bg-glowup-rose/90 disabled:opacity-50"
              >
                {savingBookOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Enregistrement…
                  </>
                ) : (
                  "Enregistrer l'ordre"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}