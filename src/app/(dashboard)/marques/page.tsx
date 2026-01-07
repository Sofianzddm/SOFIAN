"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Building2,
  Globe,
  Mail,
  Eye,
  Pencil,
  Trash2,
  Users,
  Handshake,
  TrendingUp,
} from "lucide-react";

interface Marque {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  ville: string | null;
  pays: string | null;
  contacts: {
    id: string;
    nom: string;
    email: string | null;
    principal: boolean;
  }[];
  _count: {
    collaborations: number;
  };
}

const SECTEURS = [
  "Beauté",
  "Mode",
  "Food",
  "Tech",
  "Sport",
  "Lifestyle",
  "Luxe",
  "Automobile",
  "Finance",
  "Santé",
  "Voyage",
  "Entertainment",
];

export default function MarquesPage() {
  const [marques, setMarques] = useState<Marque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSecteur, setFilterSecteur] = useState("");

  useEffect(() => {
    fetchMarques();
  }, []);

  const fetchMarques = async () => {
    try {
      const res = await fetch("/api/marques");
      const data = await res.json();
      setMarques(data);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, nom: string) => {
    if (!confirm(`Supprimer la marque "${nom}" ?`)) return;
    try {
      await fetch(`/api/marques/${id}`, { method: "DELETE" });
      setMarques(marques.filter((m) => m.id !== id));
    } catch (error) {
      alert("Erreur lors de la suppression");
    }
  };

  const filteredMarques = marques.filter((marque) => {
    const matchSearch = marque.nom.toLowerCase().includes(search.toLowerCase());
    const matchSecteur = !filterSecteur || marque.secteur === filterSecteur;
    return matchSearch && matchSecteur;
  });

  const allSecteurs = [...new Set(marques.map((m) => m.secteur).filter(Boolean))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">Marques</h1>
          <p className="text-gray-500 mt-1">
            {marques.length} marques partenaires
          </p>
        </div>
        <Link
          href="/marques/new"
          className="flex items-center gap-2 px-4 py-2 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark transition-colors shadow-lg shadow-glowup-rose/25"
        >
          <Plus className="w-4 h-4" />
          Nouvelle marque
        </Link>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-glowup-rose/10 rounded-xl">
            <Building2 className="w-6 h-6 text-glowup-rose" />
          </div>
          <div>
            <p className="text-2xl font-bold text-glowup-licorice">{marques.length}</p>
            <p className="text-sm text-gray-500">Marques actives</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-emerald-100 rounded-xl">
            <Handshake className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-glowup-licorice">
              {marques.reduce((acc, m) => acc + m._count.collaborations, 0)}
            </p>
            <p className="text-sm text-gray-500">Collaborations totales</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <TrendingUp className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-glowup-licorice">{allSecteurs.length}</p>
            <p className="text-sm text-gray-500">Secteurs représentés</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une marque..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
            />
          </div>

          {/* Filter by secteur */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={filterSecteur}
              onChange={(e) => setFilterSecteur(e.target.value)}
              className="pl-10 pr-8 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white min-w-[180px]"
            >
              <option value="">Tous les secteurs</option>
              {SECTEURS.map((secteur) => (
                <option key={secteur} value={secteur}>
                  {secteur}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid de marques */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
          Chargement...
        </div>
      ) : filteredMarques.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune marque trouvée</p>
          <Link
            href="/marques/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-glowup-rose text-white rounded-lg hover:bg-glowup-rose-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter une marque
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMarques.map((marque) => {
            const contactPrincipal = marque.contacts.find((c) => c.principal) || marque.contacts[0];
            return (
              <div
                key={marque.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group"
              >
                {/* Header avec couleur selon secteur */}
                <div className="h-2 bg-gradient-to-r from-glowup-rose to-glowup-rose-dark" />
                
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-glowup-lace flex items-center justify-center">
                        <span className="text-lg font-bold text-glowup-rose">
                          {marque.nom.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-glowup-licorice">{marque.nom}</h3>
                        {marque.secteur && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {marque.secteur}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 mb-4">
                    {marque.siteWeb && (
                      <a
                        href={marque.siteWeb}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-glowup-rose transition-colors"
                      >
                        <Globe className="w-4 h-4" />
                        <span className="truncate">{marque.siteWeb.replace(/^https?:\/\//, "")}</span>
                      </a>
                    )}
                    {contactPrincipal && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{contactPrincipal.nom}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 py-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <Handshake className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-glowup-licorice">
                        {marque._count.collaborations}
                      </span>
                      <span className="text-xs text-gray-500">collabs</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-glowup-licorice">
                        {marque.contacts.length}
                      </span>
                      <span className="text-xs text-gray-500">contacts</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <Link
                      href={`/marques/${marque.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-glowup-rose hover:bg-glowup-lace rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Voir
                    </Link>
                    <Link
                      href={`/marques/${marque.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      Modifier
                    </Link>
                    <button
                      onClick={() => handleDelete(marque.id, marque.nom)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
