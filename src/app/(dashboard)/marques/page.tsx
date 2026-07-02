"use client";

/**
 * Annuaire des marques — liste « table » SaaS moderne :
 * stat cards, recherche + filtre secteur, lignes denses avec logo auto
 * (favicon du site), contacts/collabs, actions au survol.
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Building2,
  Globe,
  Pencil,
  Trash2,
  Users,
  Handshake,
  TrendingUp,
  MapPin,
  ChevronRight,
  Loader2,
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

const INK = "#16110F";
const ROSE = "#C08B8B";

type Market = "FR" | "BENELUX";

/** Réponse de /api/benelux-outreach/companies (annuaire prospects BENELUX). */
type BeneluxCompany = {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  ville: string | null;
  contacts: { id: string; prenom: string; nom: string | null; email: string | null; principal: boolean }[];
  _count: { contacts: number; outreachTargets: number };
};

/** Mappe une entreprise BENELUX sur la forme Marque (réutilise toute la liste). */
function beneluxToMarque(c: BeneluxCompany): Marque {
  return {
    id: c.id,
    nom: c.nom,
    secteur: c.secteur,
    siteWeb: c.siteWeb,
    ville: c.ville,
    pays: "BENELUX",
    contacts: c.contacts.map((p) => ({
      id: p.id,
      nom: [p.prenom, p.nom].filter(Boolean).join(" ") || "Contact",
      email: p.email,
      principal: p.principal,
    })),
    // La colonne « Collabs » sert d'indicateur « prospects suivis » côté BENELUX.
    _count: { collaborations: c._count.outreachTargets },
  };
}

/** Logo de la marque : favicon du site, initiale en secours. */
function BrandLogo({ nom, siteWeb, size = 9 }: { nom: string; siteWeb: string | null; size?: number }) {
  const [error, setError] = useState(false);
  const domain = siteWeb ? siteWeb.replace(/^https?:\/\//, "").split("/")[0] : null;
  const px = size * 4;

  if (domain && !error) {
    return (
      <div
        className="rounded-xl bg-white ring-1 ring-black/[0.07] flex items-center justify-center overflow-hidden shrink-0"
        style={{ width: px, height: px }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt={nom}
          className="object-contain"
          style={{ width: px * 0.55, height: px * 0.55 }}
          onError={() => setError(true)}
        />
      </div>
    );
  }
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
      style={{ width: px, height: px, background: "linear-gradient(135deg, #C08B8B, #9C6B6B)" }}
    >
      {nom.charAt(0).toUpperCase()}
    </div>
  );
}

export default function MarquesPage() {
  const router = useRouter();
  const [marques, setMarques] = useState<Marque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSecteur, setFilterSecteur] = useState("");
  // Annuaire affiché : marques FR (CRM complet) ou prospects BENELUX (annuaire
  // de prospection, 100 % séparé en base).
  const [market, setMarket] = useState<Market>("FR");
  const isBenelux = market === "BENELUX";

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Deep-link depuis l'outreach : /marques?market=BENELUX&q=Entreprise
    // (prioritaire sur le dernier marché mémorisé).
    const params = new URLSearchParams(window.location.search);
    const urlMarket = params.get("market");
    const urlQuery = params.get("q");
    if (urlQuery) setSearch(urlQuery);
    if (urlMarket === "BENELUX" || urlMarket === "FR") {
      setMarket(urlMarket);
      return;
    }
    const saved = window.localStorage.getItem("marques.market");
    if (saved === "BENELUX" || saved === "FR") setMarket(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("marques.market", market);
    }
  }, [market]);

  useEffect(() => {
    setLoading(true);
    setFilterSecteur("");
    if (market === "BENELUX") fetchBeneluxCompanies();
    else fetchMarques();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  const fetchMarques = async () => {
    try {
      const res = await fetch("/api/marques");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Erreur GET marques:", data);
        setMarques([]);
        return;
      }
      setMarques(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Erreur:", error);
      setMarques([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBeneluxCompanies = async () => {
    try {
      const res = await fetch("/api/benelux-outreach/companies");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Erreur GET companies BENELUX:", data);
        setMarques([]);
        return;
      }
      const companies: BeneluxCompany[] = Array.isArray(data?.companies) ? data.companies : [];
      setMarques(companies.map(beneluxToMarque));
    } catch (error) {
      console.error("Erreur:", error);
      setMarques([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, nom: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Supprimer la marque "${nom}" ?`)) return;
    try {
      await fetch(`/api/marques/${id}`, { method: "DELETE" });
      setMarques((prev) => prev.filter((m) => m.id !== id));
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  const allSecteurs = useMemo(
    () => [...new Set(marques.map((m) => m.secteur).filter(Boolean))].sort() as string[],
    [marques]
  );

  const filteredMarques = useMemo(() => {
    const q = search.trim().toLowerCase();
    return marques
      .filter((m) => {
        const matchSearch =
          !q ||
          m.nom.toLowerCase().includes(q) ||
          (m.siteWeb || "").toLowerCase().includes(q) ||
          (m.ville || "").toLowerCase().includes(q);
        const matchSecteur = !filterSecteur || m.secteur === filterSecteur;
        return matchSearch && matchSecteur;
      })
      .sort(
        (a, b) =>
          (b._count?.collaborations ?? 0) - (a._count?.collaborations ?? 0) ||
          a.nom.localeCompare(b.nom, "fr")
      );
  }, [marques, search, filterSecteur]);

  const totalCollabs = marques.reduce((acc, m) => acc + (m._count?.collaborations ?? 0), 0);
  const totalContacts = marques.reduce((acc, m) => acc + (m.contacts?.length ?? 0), 0);

  const STATS = [
    {
      label: isBenelux ? "Entreprises" : "Marques",
      value: marques.length,
      icon: Building2,
      tint: "text-rose-500 bg-rose-50",
    },
    {
      label: isBenelux ? "Prospects suivis" : "Collaborations",
      value: totalCollabs,
      icon: Handshake,
      tint: "text-emerald-600 bg-emerald-50",
    },
    { label: "Contacts", value: totalContacts, icon: Users, tint: "text-blue-600 bg-blue-50" },
    { label: "Secteurs", value: allSecteurs.length, icon: TrendingUp, tint: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAF9F7" }}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* ====================== Topbar ====================== */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.02em]" style={{ color: INK }}>
              {isBenelux ? "Annuaire BENELUX" : "Marques"}
            </h1>
            <p className="text-[13px] text-gray-400 mt-0.5">
              {isBenelux
                ? `${marques.length} entreprise${marques.length > 1 ? "s" : ""} prospect${
                    marques.length > 1 ? "s" : ""
                  } BENELUX — séparées de vos marques FR`
                : `${marques.length} marque${marques.length > 1 ? "s" : ""} dans le CRM — fiches partagées avec toute l'équipe`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bascule marché : marques FR ↔ annuaire BENELUX (données séparées) */}
            <div
              className="inline-flex rounded-lg overflow-hidden ring-1 ring-black/[0.07] bg-white shrink-0"
              title="Basculer entre les marques France et l'annuaire BENELUX"
            >
              {(["FR", "BENELUX"] as const).map((m) => {
                const active = market === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMarket(m)}
                    className="px-3 py-2 text-[13px] font-semibold transition"
                    style={
                      active
                        ? { backgroundColor: INK, color: "white" }
                        : { backgroundColor: "white", color: "#9CA3AF" }
                    }
                  >
                    {m === "FR" ? "🇫🇷 France" : "🇧🇪 BENELUX"}
                  </button>
                );
              })}
            </div>
            {!isBenelux && (
              <Link
                href="/marques/new"
                className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold rounded-lg text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: INK }}
              >
                <Plus className="w-3.5 h-3.5" />
                Nouvelle marque
              </Link>
            )}
          </div>
        </div>

        {/* ====================== Stat cards ====================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] px-4 py-3.5 flex items-start justify-between"
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{stat.label}</p>
                <p className="text-[22px] font-bold tabular-nums mt-0.5" style={{ color: INK }}>
                  {stat.value}
                </p>
              </div>
              <div className={`p-2 rounded-xl shrink-0 ${stat.tint}`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>

        {/* ====================== Toolbar ====================== */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="Rechercher une marque, un site, une ville…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white ring-1 ring-black/[0.07] text-[13px] placeholder:text-gray-300 focus:outline-none focus:ring-2 shadow-[0_1px_2px_rgba(16,12,10,0.04)]"
            />
          </div>
          <select
            value={filterSecteur}
            onChange={(e) => setFilterSecteur(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white ring-1 ring-black/[0.07] text-[13px] text-gray-600 focus:outline-none focus:ring-2 appearance-none min-w-[170px] shadow-[0_1px_2px_rgba(16,12,10,0.04)]"
          >
            <option value="">Tous les secteurs</option>
            {allSecteurs.map((secteur) => (
              <option key={secteur} value={secteur}>
                {secteur}
              </option>
            ))}
          </select>
        </div>

        {/* ====================== Liste ====================== */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: ROSE }} />
          </div>
        ) : filteredMarques.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] py-16 text-center">
            <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {isBenelux ? "Aucune entreprise BENELUX" : "Aucune marque trouvée"}
            </p>
            {isBenelux ? (
              <Link
                href="/outreach"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: INK }}
              >
                <Plus className="w-3.5 h-3.5" />
                Prospecter en BENELUX
              </Link>
            ) : (
              <Link
                href="/marques/new"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: INK }}
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une marque
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
            {/* En-tête de colonnes */}
            <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_repeat(2,90px)_110px] gap-3 px-5 py-2.5 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-300">
              <span>Marque</span>
              <span>Site</span>
              <span>Localisation</span>
              <span className="text-right">Contacts</span>
              <span className="text-right">{isBenelux ? "Prospects" : "Collabs"}</span>
              <span />
            </div>

            <div className="divide-y divide-gray-50">
              {filteredMarques.map((marque) => {
                const domain = marque.siteWeb
                  ? marque.siteWeb.replace(/^https?:\/\//, "").split("/")[0]
                  : null;
                return (
                  <div
                    key={marque.id}
                    onClick={() =>
                      router.push(
                        isBenelux ? `/marques/benelux/${marque.id}` : `/marques/${marque.id}`
                      )
                    }
                    className="group grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_repeat(2,90px)_110px] gap-3 items-center px-5 py-3 cursor-pointer hover:bg-gray-50/60 transition-colors"
                  >
                    {/* Marque */}
                    <div className="flex items-center gap-3 min-w-0">
                      <BrandLogo nom={marque.nom} siteWeb={marque.siteWeb} />
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: INK }}>
                          {marque.nom}
                        </p>
                        {marque.secteur && (
                          <span
                            className="inline-block mt-0.5 px-1.5 py-[1px] rounded text-[10px] font-medium ring-1 ring-inset ring-black/[0.05]"
                            style={{ backgroundColor: "#F5EBE0", color: INK }}
                          >
                            {marque.secteur}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Site */}
                    <div className="hidden md:block min-w-0">
                      {domain ? (
                        <a
                          href={marque.siteWeb!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-500 hover:underline truncate"
                          style={{ color: ROSE }}
                        >
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{domain}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-gray-200">—</span>
                      )}
                    </div>

                    {/* Localisation */}
                    <div className="hidden md:block min-w-0">
                      {marque.ville ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-500 truncate">
                          <MapPin className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          <span className="truncate">
                            {marque.ville}
                            {marque.pays ? `, ${marque.pays}` : ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-200">—</span>
                      )}
                    </div>

                    {/* Contacts */}
                    <div className="hidden md:flex items-center justify-end gap-1.5 text-[13px] tabular-nums text-gray-600">
                      <Users className="w-3.5 h-3.5 text-gray-300" />
                      {marque.contacts?.length ?? 0}
                    </div>

                    {/* Collabs */}
                    <div className="hidden md:flex items-center justify-end gap-1.5 text-[13px] tabular-nums text-gray-600">
                      <Handshake className="w-3.5 h-3.5 text-gray-300" />
                      {marque._count?.collaborations ?? 0}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1">
                      {!isBenelux && (
                        <>
                          <Link
                            href={`/marques/${marque.id}/edit`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-700 hover:bg-gray-100 transition-all"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={(e) => handleDelete(e, marque.id, marque.nom)}
                            className="p-1.5 rounded-lg text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-200 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pied de liste */}
            <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-300">
              {filteredMarques.length} résultat{filteredMarques.length > 1 ? "s" : ""}
              {(search || filterSecteur) && ` · filtré sur ${marques.length}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
