"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  User,
  Building2,
  Handshake,
  TrendingUp,
  UserCog,
  Loader2,
  X,
  ArrowRight,
} from "lucide-react";

interface SearchResult {
  talents: any[];
  marques: any[];
  collaborations: any[];
  negociations: any[];
  users: any[];
}

export function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ouvrir avec Cmd+K ou Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus sur l'input quand on ouvre
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Recherche avec debounce
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (query.length < 2) {
      setResults(null);
      return;
    }

    setLoading(true);

    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          setResults(await res.json());
        }
      } catch (error) {
        console.error("Erreur recherche:", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query]);

  function navigate(url: string) {
    router.push(url);
    setOpen(false);
    setQuery("");
    setResults(null);
  }

  function getTotalResults() {
    if (!results) return 0;
    return (
      results.talents.length +
      results.marques.length +
      results.collaborations.length +
      results.negociations.length +
      results.users.length
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-w-[300px]"
      >
        <Search className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500">Rechercher...</span>
        <kbd className="ml-auto px-2 py-0.5 text-xs bg-gray-100 border border-gray-300 rounded">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-xl shadow-2xl z-50 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher talents, marques, collaborations..."
            className="flex-1 outline-none text-gray-900 placeholder-gray-400"
          />
          {loading && <Loader2 className="w-5 h-5 text-glowup-rose animate-spin" />}
          <button
            onClick={() => setOpen(false)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[500px] overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-8 text-center text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Tapez au moins 2 caractères pour rechercher</p>
              <p className="text-sm mt-2">
                Vous pouvez rechercher des talents, marques, collaborations, négociations et
                utilisateurs
              </p>
            </div>
          ) : loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto text-glowup-rose animate-spin" />
              <p className="text-gray-500 mt-2">Recherche en cours...</p>
            </div>
          ) : results && getTotalResults() === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg">Aucun résultat trouvé</p>
              <p className="text-sm mt-2">Essayez avec d'autres mots-clés</p>
            </div>
          ) : (
            <div className="p-2">
              {/* Talents */}
              {results && results.talents.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Talents ({results.talents.length})
                  </div>
                  {results.talents.map((talent) => (
                    <button
                      key={talent.id}
                      onClick={() => navigate(`/talents/${talent.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                    >
                      {talent.photo ? (
                        <img
                          src={talent.photo}
                          alt={talent.prenom}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-glowup-rose to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                          {talent.prenom[0]}
                          {talent.nom[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">
                          {talent.prenom} {talent.nom}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {talent.email || talent.ville || "Talent"}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}

              {/* Marques */}
              {results && results.marques.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Marques ({results.marques.length})
                  </div>
                  {results.marques.map((marque) => (
                    <button
                      key={marque.id}
                      onClick={() => navigate(`/marques/${marque.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                    >
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{marque.nom}</div>
                        <div className="text-sm text-gray-500 truncate">
                          {marque.secteur || marque.raisonSociale || "Marque"}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}

              {/* Collaborations */}
              {results && results.collaborations.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Collaborations ({results.collaborations.length})
                  </div>
                  {results.collaborations.map((collab) => (
                    <button
                      key={collab.id}
                      onClick={() => navigate(`/collaborations/${collab.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                    >
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Handshake className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{collab.reference}</div>
                        <div className="text-sm text-gray-500 truncate">
                          {collab.talent.prenom} {collab.talent.nom} × {collab.marque.nom}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        }).format(collab.montantBrut)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}

              {/* Négociations */}
              {results && results.negociations.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Négociations ({results.negociations.length})
                  </div>
                  {results.negociations.map((nego) => (
                    <button
                      key={nego.id}
                      onClick={() => navigate(`/negociations/${nego.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                    >
                      <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{nego.reference}</div>
                        <div className="text-sm text-gray-500 truncate">
                          {nego.talent.prenom} {nego.talent.nom} × {nego.marque.nom}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}

              {/* Utilisateurs */}
              {results && results.users.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Utilisateurs ({results.users.length})
                  </div>
                  {results.users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => navigate(`/users/${user.id}/edit`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                    >
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 font-bold">
                        {user.prenom[0]}
                        {user.nom[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">
                          {user.prenom} {user.nom}
                        </div>
                        <div className="text-sm text-gray-500 truncate">{user.email}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-0.5 bg-white border border-gray-300 rounded">↑</kbd>
              <kbd className="px-2 py-0.5 bg-white border border-gray-300 rounded">↓</kbd>
              pour naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-0.5 bg-white border border-gray-300 rounded">↵</kbd>
              pour sélectionner
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white border border-gray-300 rounded">esc</kbd>
            pour fermer
          </span>
        </div>
      </div>
    </>
  );
}
