"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
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
} from "lucide-react";

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
}

export default function TalentsPage() {
  const { data: session } = useSession();
  const [talents, setTalents] = useState<Talent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNiche, setFilterNiche] = useState("");

  // Récupérer le rôle de l'utilisateur
  const user = session?.user as { id: string; role: string; name: string } | undefined;
  const role = user?.role || "";
  
  // Permissions basées sur le rôle
  const canAddTalent = role === "ADMIN" || role === "HEAD_OF";
  const canEditTalent = role === "ADMIN" || role === "HEAD_OF";
  const canDeleteTalent = role === "ADMIN";
  const canArchiveTalent = role === "ADMIN" || role === "HEAD_OF";
  const canReorderBook =
    role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";

  const [showBookOrderModal, setShowBookOrderModal] = useState(false);
  const [bookOrderList, setBookOrderList] = useState<Talent[]>([]);
  const [savingBookOrder, setSavingBookOrder] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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

  const filteredTalents = talents.filter((talent) => {
    const matchSearch =
      `${talent.prenom} ${talent.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      talent.email.toLowerCase().includes(search.toLowerCase());
    const matchNiche = !filterNiche || talent.niches.includes(filterNiche);
    return matchSearch && matchNiche;
  });

  const allNiches = [...new Set(talents.flatMap((t) => t.niches))];

  const formatFollowers = (count: number | null) => {
    if (!count) return "-";
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  // Titre dynamique selon le rôle
  const getPageTitle = () => {
    if (role === "TM") return "Mes talents";
    return "Talents";
  };

  const getPageSubtitle = () => {
    if (role === "TM") return `${talents.length} talent(s) sous ma gestion`;
    return `${talents.length} talents dans l'agence`;
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
          {/* Ordre du book - ADMIN, HEAD_OF, HEAD_OF_INFLUENCE */}
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-glowup-rose mb-3" />
            <p>Chargement...</p>
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
              {filteredTalents.map((talent) => (
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