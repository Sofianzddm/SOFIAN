"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Send,
  Check,
  Trash2,
  FileCheck,
  AlertTriangle,
  Clock,
} from "lucide-react";

// Types
type TabType = "invoices" | "quotes";
type PeriodType = "3m" | "6m" | "year" | "all";

interface DocumentInfo {
  id: string;
  reference: string;
  type: "DEVIS" | "FACTURE" | "AVOIR";
  statut: string;
  montantHT: number;
  montantTTC: number;
  dateEmission: string | null;
  dateEcheance: string | null;
  createdAt: string;
  collaboration: {
    id: string;
    reference: string;
    talent: { id: string; prenom: string; nom: string };
    marque: { id: string; nom: string };
    marqueContact: { id: string; prenom: string; nom: string } | null;
  } | null;
}

interface QuoteInfo {
  id: string;
  reference: string;
  object: string;
  issueDate: string;
  validUntil: string;
  totalHT: number;
  totalTTC: number;
  currency: string;
  status: string;
  marque: { id: string; nom: string };
  marqueContact: { id: string; prenom: string; nom: string } | null;
  talent: { id: string; prenom: string; nom: string } | null;
  collaboration: { id: string; reference: string } | null;
}

interface Stats {
  facturesEnRetard: number;
  facturesEnAttente: number;
}

interface QuoteStats {
  enAttente: number;
  expire: number;
}

const ROLES_FACTURES = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"];
const QUOTE_STATUS_VALUES = ["DRAFT", "REGISTERED", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED", "INVOICED", "CANCELLED"];
// Mapping StatutDocument (Document DEVIS) → status affiché dans l’onglet Devis
const DOC_STATUT_TO_QUOTE_STATUS: Record<string, string> = {
  BROUILLON: "DRAFT",
  VALIDE: "REGISTERED",
  ENVOYE: "SENT",
  REFUSE: "DECLINED",
  ANNULE: "CANCELLED",
  PAYE: "INVOICED",
};
function documentToQuoteInfo(d: {
  id: string;
  reference: string;
  titre?: string | null;
  statut: string;
  dateEmission: string | null;
  dateEcheance: string | null;
  montantHT: unknown;
  montantTTC: unknown;
  collaboration?: {
    id: string;
    reference: string;
    talent?: { id: string; prenom: string; nom: string };
    marque?: { id: string; nom: string };
    marqueContact?: { id: string; prenom: string; nom: string } | null;
  } | null;
}): QuoteInfo {
  const issueDate = d.dateEmission ?? new Date().toISOString();
  const issue = new Date(issueDate);
  const validUntil = d.dateEcheance
    ? new Date(d.dateEcheance).toISOString()
    : new Date(issue.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: d.id,
    reference: d.reference,
    object: d.titre || d.reference,
    issueDate,
    validUntil,
    totalHT: Number(d.montantHT ?? 0),
    totalTTC: Number(d.montantTTC ?? 0),
    currency: "EUR",
    status: DOC_STATUT_TO_QUOTE_STATUS[d.statut] ?? "DRAFT",
    marque: d.collaboration?.marque ?? { id: "", nom: "-" },
    marqueContact: d.collaboration?.marqueContact ?? null,
    talent: d.collaboration?.talent ?? null,
    collaboration: d.collaboration ? { id: d.collaboration.id, reference: d.collaboration.reference } : null,
  };
}
const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "3m", label: "3 mois" },
  { value: "6m", label: "6 mois" },
  { value: "year", label: "Cette année" },
  { value: "all", label: "Tout" },
];
const PER_PAGE_OPTIONS = [10, 25, 50];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

export default function FacturesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = (searchParams.get("tab") === "quotes" ? "quotes" : "invoices") as TabType;
  const setTab = useCallback(
    (t: TabType) => {
      const u = new URLSearchParams(searchParams.toString());
      u.set("tab", t);
      router.replace(`/factures?${u.toString()}`);
    },
    [router, searchParams]
  );

  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodType>((searchParams.get("period") as PeriodType) || "all");
  const [statutFilter, setStatutFilter] = useState(searchParams.get("statut") || "all");
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const [perPage, setPerPage] = useState(Number(searchParams.get("perPage")) || 10);
  const [sortBy, setSortBy] = useState<string>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [quotesData, setQuotesData] = useState<{ quotes: QuoteInfo[]; stats: QuoteStats } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"DEVIS" | "FACTURE">("FACTURE");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [dropdownNouveauOpen, setDropdownNouveauOpen] = useState(false);
  const dropdownNouveauRef = useRef<HTMLDivElement>(null);
  const [infoBannerClosed, setInfoBannerClosed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("factures-info-banner-closed") === "1";
  });

  // Sync URL with filters (build from state only to avoid loop: searchParams changes after replace)
  useEffect(() => {
    const u = new URLSearchParams();
    u.set("tab", tab);
    if (debouncedSearch) u.set("search", debouncedSearch);
    if (period !== "all") u.set("period", period);
    if (statutFilter !== "all") u.set("statut", statutFilter);
    if (page > 1) u.set("page", String(page));
    if (perPage !== 10) u.set("perPage", String(perPage));
    const queryString = u.toString();
    const next = `/factures${queryString ? `?${queryString}` : ""}`;
    if (typeof window !== "undefined" && window.location.search !== (queryString ? `?${queryString}` : "")) {
      router.replace(next);
    }
  }, [tab, debouncedSearch, period, statutFilter, page, perPage, router]);

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string })?.role;
    if (role && !ROLES_FACTURES.includes(role)) {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownNouveauRef.current && !dropdownNouveauRef.current.contains(e.target as Node)) {
        setDropdownNouveauOpen(false);
      }
    };
    if (dropdownNouveauOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [dropdownNouveauOpen]);

  const fetchFactures = useCallback(async () => {
    try {
      const res = await fetch("/api/factures", { cache: "no-store" });
      if (!res.ok) {
        setDocuments([]);
        return;
      }
      const data = await res.json();
      setStats({
        facturesEnRetard: data.stats?.facturesEnRetard ?? 0,
        facturesEnAttente: data.stats?.facturesEnAttente ?? 0,
      });
      let docs: DocumentInfo[] = Array.isArray(data.documents) ? data.documents : [];
      if (docs.length === 0 && Array.isArray(data.facturesMarques) && data.facturesMarques.length > 0) {
        docs = data.facturesMarques.map((f: { id: string; reference: string; statut: string; montantHT: number; montantTTC: number; dateEmission: string | null; dateEcheance: string | null; collaboration: { id: string; reference: string; talent: { id: string; prenom: string; nom: string }; marque: { id: string; nom: string } } }) => ({
          id: f.id,
          reference: f.reference,
          type: "FACTURE",
          statut: f.statut,
          montantHT: f.montantHT,
          montantTTC: f.montantTTC,
          dateEmission: f.dateEmission,
          dateEcheance: f.dateEcheance,
          createdAt: f.dateEmission ?? new Date().toISOString(),
          collaboration: f.collaboration ? { ...f.collaboration, marqueContact: null } : null,
        }));
      }
      setDocuments(docs);
    } catch (e) {
      console.error("Erreur chargement factures:", e);
      setDocuments([]);
    }
  }, []);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/factures", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setQuotesData({ quotes: [], stats: { enAttente: 0, expire: 0 } });
        return;
      }
      const data = await res.json();
      const docs = Array.isArray(data.devis) ? data.devis : [];
      const stats = data.devisStats ?? { enAttente: 0, expire: 0 };
      type DocRow = Parameters<typeof documentToQuoteInfo>[0];
      const list: QuoteInfo[] = docs.map((d: Record<string, unknown>) => {
        const collab = d.collaboration as DocRow["collaboration"];
        return documentToQuoteInfo({
          id: String(d.id ?? ""),
          reference: String(d.reference ?? ""),
          titre: d.titre != null ? String(d.titre) : null,
          statut: String(d.statut ?? "BROUILLON"),
          dateEmission: d.dateEmission ? String(d.dateEmission) : null,
          dateEcheance: d.dateEcheance ? String(d.dateEcheance) : null,
          montantHT: d.montantHT,
          montantTTC: d.montantTTC,
          collaboration: collab ?? null,
        });
      });
      setQuotesData({ quotes: list, stats: { enAttente: Number(stats.enAttente) || 0, expire: Number(stats.expire) || 0 } });
    } catch (e) {
      console.error("fetchQuotes:", e);
      setQuotesData({ quotes: [], stats: { enAttente: 0, expire: 0 } });
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    if (tab === "invoices") {
      fetchFactures().finally(() => setLoading(false));
    } else {
      fetchQuotes().finally(() => setLoading(false));
    }
  }, [status, tab, fetchFactures, fetchQuotes]);

  // À l’ouverture de l’onglet Devis, remettre le filtre statut à "Tout" si c’était un statut facture
  useEffect(() => {
    if (tab !== "quotes") return;
    if (statutFilter !== "all" && !QUOTE_STATUS_VALUES.includes(statutFilter)) {
      setStatutFilter("all");
    }
  }, [tab, statutFilter]);

  // Factures: filter by period + search + statut (type FACTURE, insensible à la casse)
  const facturesFiltered = useMemo(() => {
    const docs = Array.isArray(documents) ? documents : [];
    let list = docs.filter((d) => String(d.type).toUpperCase() === "FACTURE");
    const now = new Date();
    if (period !== "all") {
      let from: Date;
      if (period === "3m") from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      else if (period === "6m") from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      else from = new Date(now.getFullYear(), 0, 1);
      list = list.filter((d) => new Date(d.dateEmission || d.createdAt) >= from);
    }
    if (statutFilter !== "all") {
      if (statutFilter === "EN_RETARD") {
        list = list.filter((d) => d.statut === "ENVOYE" && d.dateEcheance && new Date(d.dateEcheance) < now);
      } else {
        list = list.filter((d) => d.statut === statutFilter);
      }
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (d) =>
          d.reference.toLowerCase().includes(q) ||
          (d.collaboration?.marque?.nom ?? "").toLowerCase().includes(q) ||
          `${d.collaboration?.talent?.prenom ?? ""} ${d.collaboration?.talent?.nom ?? ""}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [documents, period, statutFilter, debouncedSearch]);

  const facturesSorted = useMemo(() => {
    const arr = [...facturesFiltered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = new Date(a.dateEmission || a.createdAt).getTime() - new Date(b.dateEmission || b.createdAt).getTime();
      else if (sortBy === "reference") cmp = a.reference.localeCompare(b.reference);
      else if (sortBy === "montant") cmp = Number(a.montantTTC) - Number(b.montantTTC);
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [facturesFiltered, sortBy, sortOrder]);

  const facturesPaginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return facturesSorted.slice(start, start + perPage);
  }, [facturesSorted, page, perPage]);

  const quotesFiltered = useMemo(() => {
    let list = [...(quotesData?.quotes ?? [])];
    const now = new Date();
    if (period !== "all") {
      let from: Date;
      if (period === "3m") from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      else if (period === "6m") from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      else from = new Date(now.getFullYear(), 0, 1);
      list = list.filter((q) => new Date(q.issueDate) >= from);
    }
    if (statutFilter !== "all") {
      list = list.filter((q) => q.status === statutFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (x) =>
          x.reference.toLowerCase().includes(q) ||
          (x.object || "").toLowerCase().includes(q) ||
          (x.marque?.nom ?? "").toLowerCase().includes(q) ||
          (x.talent ? `${x.talent.prenom} ${x.talent.nom}`.toLowerCase().includes(q) : false)
      );
    }
    return list;
  }, [quotesData, period, statutFilter, debouncedSearch]);

  const quotesSorted = useMemo(() => {
    const arr = [...quotesFiltered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
      else if (sortBy === "reference") cmp = a.reference.localeCompare(b.reference);
      else if (sortBy === "montant") cmp = a.totalTTC - b.totalTTC;
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [quotesFiltered, sortBy, sortOrder]);

  const quotesPaginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return quotesSorted.slice(start, start + perPage);
  }, [quotesSorted, page, perPage]);

  const totalFactures = facturesSorted.length;
  const totalQuotes = quotesSorted.length;
  const totalPages = Math.max(1, Math.ceil((tab === "invoices" ? totalFactures : totalQuotes) / perPage));

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (tab === "invoices") {
      const ids = facturesPaginated.filter((d) => d.statut !== "ANNULE").map((d) => d.id);
      const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
      if (allSelected) setSelectedIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      else setSelectedIds((prev) => new Set([...prev, ...ids]));
    } else {
      const ids = quotesPaginated.map((q) => q.id);
      const allSelected = ids.every((id) => selectedIds.has(id));
      if (allSelected) setSelectedIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      else setSelectedIds((prev) => new Set([...prev, ...ids]));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkEnvoyerFactures = async () => {
    setBulkActionLoading(true);
    for (const id of selectedIds) {
      await fetch(`/api/documents/${id}/envoyer`, { method: "POST" });
    }
    clearSelection();
    await fetchFactures();
    setBulkActionLoading(false);
  };

  const handleBulkMarquerPaye = async () => {
    setBulkActionLoading(true);
    for (const id of selectedIds) {
      await fetch(`/api/documents/${id}/payer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datePaiement: new Date().toISOString().slice(0, 10) }),
      });
    }
    clearSelection();
    await fetchFactures();
    setBulkActionLoading(false);
  };

  const handleBulkDownloadPdf = () => {
    selectedIds.forEach((id) => {
      window.open(`/api/documents/${id}/pdf`, "_blank");
    });
  };

  const handleBulkConvertirDevis = async () => {
    setBulkActionLoading(true);
    for (const id of selectedIds) {
      await fetch(`/api/documents/${id}/convertir-facture`, { method: "POST" });
    }
    clearSelection();
    await fetchFactures();
    await fetchQuotes();
    setBulkActionLoading(false);
  };

  const role = (session?.user as { role?: string })?.role;
  const canAccess = role && ROLES_FACTURES.includes(role);

  if (status === "loading" || (status === "authenticated" && !canAccess)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const isInvoices = tab === "invoices";
  const title = isInvoices ? "Liste des factures" : "Liste des devis";
  const badgeFacturesEncours = stats?.facturesEnAttente ?? 0;
  const badgeFacturesRetard = stats?.facturesEnRetard ?? 0;
  const badgeDevisAttente = quotesData?.stats.enAttente ?? 0;
  const badgeDevisExpire = quotesData?.stats.expire ?? 0;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">{title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {isInvoices && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
                  <Clock className="w-3.5 h-3.5" />
                  Encours client : {badgeFacturesEncours}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  En retard : {badgeFacturesRetard}
                </span>
              </>
            )}
            {!isInvoices && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
                  En attente : {badgeDevisAttente}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600">
                  Expiré : {badgeDevisExpire}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="relative" ref={dropdownNouveauRef}>
          <button
            type="button"
            onClick={() => setDropdownNouveauOpen((o) => !o)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1110] text-white rounded-lg hover:bg-[#1A1110]/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau
            <ChevronDown className="w-4 h-4" />
          </button>
          {dropdownNouveauOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
              <button
                type="button"
                onClick={() => {
                  setModalType("FACTURE");
                  setShowModal(true);
                  setDropdownNouveauOpen(false);
                }}
                className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-2 rounded-t-lg text-[#1A1110]"
              >
                <FileText className="w-4 h-4 text-emerald-500" />
                Nouvelle facture
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalType("DEVIS");
                  setShowModal(true);
                  setDropdownNouveauOpen(false);
                }}
                className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100 rounded-b-lg text-[#1A1110]"
              >
                <FileText className="w-4 h-4 text-blue-500" />
                Nouveau devis
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("invoices")}
            className="relative px-4 py-3 text-sm font-medium transition-colors"
          >
            <span className={isInvoices ? "text-glowup-licorice" : "text-gray-500 hover:text-gray-700"}>
              Factures
            </span>
            {isInvoices && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-[#1A1110] to-[#C08B8B]"
                aria-hidden
              />
            )}
          </button>
          <button
            onClick={() => setTab("quotes")}
            className="relative px-4 py-3 text-sm font-medium transition-colors"
          >
            <span className={!isInvoices ? "text-glowup-licorice" : "text-gray-500 hover:text-gray-700"}>
              Devis
            </span>
            {!isInvoices && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-[#1A1110] to-[#C08B8B]"
                aria-hidden
              />
            )}
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-glowup-rose"
              />
            </div>
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as PeriodType);
                setPage(1);
              }}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Recherche avancée {advancedOpen ? "∧" : "∨"}
            </button>
          </div>
          {advancedOpen && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
              <label className="text-sm text-gray-600">Statut</label>
              <select
                value={statutFilter}
                onChange={(e) => {
                  setStatutFilter(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                {isInvoices ? (
                  <>
                    <option value="all">Tout</option>
                    <option value="VALIDE">Enregistré</option>
                    <option value="BROUILLON">Brouillon</option>
                    <option value="ENVOYE">Envoyé</option>
                    <option value="PAYE">Payé</option>
                    <option value="EN_RETARD">En retard</option>
                    <option value="ANNULE">Annulé</option>
                  </>
                ) : (
                  <>
                    <option value="all">Tout</option>
                    <option value="DRAFT">Brouillon</option>
                    <option value="REGISTERED">Enregistré</option>
                    <option value="SENT">Envoyé</option>
                    <option value="VIEWED">Vu</option>
                    <option value="ACCEPTED">Accepté</option>
                    <option value="DECLINED">Refusé</option>
                    <option value="EXPIRED">Expiré</option>
                    <option value="INVOICED">Facturé</option>
                    <option value="CANCELLED">Annulé</option>
                  </>
                )}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Table + loading */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
          </div>
        ) : isInvoices ? (
          facturesPaginated.length === 0 ? (
            <div className="text-center py-16 px-4">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Aucune facture à afficher</p>
              {documents.length === 0 ? (
                <p className="text-sm text-gray-400 mt-2">
                  Aucun document chargé. Vérifiez votre connexion ou ouvrez la page{" "}
                  <Link href="/documents" className="text-[#1A1110] underline">
                    Documents
                  </Link>{" "}
                  pour voir tous les documents.
                </p>
              ) : (
                <p className="text-sm text-gray-400 mt-2">
                  {documents.length} document(s) chargé(s), dont {documents.filter((d) => String(d.type).toUpperCase() === "FACTURE").length} facture(s). Essayez de changer les filtres (période, statut, recherche).
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="w-10 py-3 px-4">
                        <input
                          type="checkbox"
                          checked={
                            (() => {
                              const selectable = facturesPaginated.filter((d) => d.statut !== "ANNULE");
                              return selectable.length > 0 && selectable.every((d) => selectedIds.has(d.id));
                            })()
                          }
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">
                        <button type="button" onClick={() => toggleSort("reference")} className="flex items-center gap-1 hover:text-[#1A1110]">
                          Facture n°
                          {sortBy === "reference" && (sortOrder === "asc" ? " ↑" : " ↓")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                        <button type="button" onClick={() => toggleSort("date")} className="flex items-center gap-1 hover:text-[#1A1110]">
                          Date facture
                          {sortBy === "date" && (sortOrder === "asc" ? " ↑" : " ↓")}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">État</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Client</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Total HT</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Total TTC</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Restant dû</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturesPaginated.map((doc) => {
                      const isLate = doc.statut === "ENVOYE" && doc.dateEcheance && new Date(doc.dateEcheance) < new Date();
                      const restantDu = doc.statut === "PAYE" ? 0 : Number(doc.montantTTC ?? 0);
                      const isCancelled = doc.statut === "ANNULE";
                      const marqueId = doc.collaboration?.marque?.id;
                      const contact = doc.collaboration?.marqueContact;
                      const marqueNom = doc.collaboration?.marque?.nom;
                      return (
                        <tr
                          key={doc.id}
                          onClick={() => {
                            if (!isCancelled) router.push(`/factures/${doc.id}`);
                          }}
                          className={`border-b border-gray-100 transition-colors ${isCancelled ? "bg-gray-50/50 text-gray-400" : "cursor-pointer hover:bg-gray-50"}`}
                        >
                          <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                            {!isCancelled && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(doc.id)}
                                onChange={() => toggleSelect(doc.id)}
                                className="rounded border-gray-300"
                              />
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {isCancelled ? (
                              <span className="font-mono text-sm line-through text-gray-400">{doc.reference}</span>
                            ) : (
                              <Link
                                href={`/factures/${doc.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono text-sm font-medium text-[#1A1110] hover:underline"
                              >
                                {doc.reference}
                              </Link>
                            )}
                          </td>
                          <td className="py-4 px-4 text-sm text-gray-600 hidden md:table-cell">
                            {doc.dateEmission ? new Date(doc.dateEmission).toLocaleDateString("fr-FR") : "-"}
                          </td>
                          <td className="py-4 px-4">
                            <FactureStatutBadge statut={doc.statut} isLate={!!isLate} />
                          </td>
                          <td className="py-4 px-4">
                            <ClientCell marqueId={marqueId} marqueNom={marqueNom} contact={contact} isCancelled={isCancelled} />
                          </td>
                          <td className="py-4 px-4 text-right text-sm hidden lg:table-cell">
                            {formatMoney(Number(doc.montantHT))}
                          </td>
                          <td className="py-4 px-4 text-right text-sm hidden lg:table-cell">
                            {formatMoney(Number(doc.montantTTC))}
                          </td>
                          <td className={`py-4 px-4 text-right text-sm font-semibold ${restantDu > 0 ? "text-red-600" : "text-green-600"}`}>
                            {restantDu === 0 ? "0,00 €" : formatMoney(restantDu)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <FooterTotalsFactures items={facturesFiltered} />
              <Pagination
                page={page}
                totalPages={totalPages}
                total={totalFactures}
                perPage={perPage}
                onPageChange={setPage}
                onPerPageChange={(v) => {
                  setPerPage(v);
                  setPage(1);
                }}
              />
            </>
          )
        ) : quotesPaginated.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucun devis trouvé</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="w-10 py-4 px-4">
                      <input
                        type="checkbox"
                        checked={quotesPaginated.length > 0 && quotesPaginated.every((q) => selectedIds.has(q.id))}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left py-4 px-4 text-xs font-semibold text-gray-500 uppercase">
                      <button onClick={() => toggleSort("reference")} className="flex items-center gap-1 hover:text-glowup-licorice">
                        Devis n°
                        {sortBy === "reference" && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </button>
                    </th>
                    <th className="text-left py-4 px-4 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">
                      <button onClick={() => toggleSort("date")} className="flex items-center gap-1 hover:text-glowup-licorice">
                        Date
                        {sortBy === "date" && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </button>
                    </th>
                    <th className="text-left py-4 px-4 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Validité</th>
                    <th className="text-left py-4 px-4 text-xs font-semibold text-gray-500 uppercase">État</th>
                    <th className="text-left py-4 px-4 text-xs font-semibold text-gray-500 uppercase">Client</th>
                    <th className="text-left py-4 px-4 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Talent</th>
                    <th className="text-right py-4 px-4 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Total HT</th>
                    <th className="text-right py-4 px-4 text-xs font-semibold text-gray-500 uppercase">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {quotesPaginated.map((q) => {
                    const isExpired = q.status !== "INVOICED" && new Date(q.validUntil) < new Date();
                    return (
                      <tr
                        key={q.id}
                        className={`hover:bg-gray-50/50 cursor-pointer ${q.status === "CANCELLED" ? "opacity-50" : ""}`}
                        onClick={() => q.status !== "CANCELLED" && router.push(`/factures/${q.id}`)}
                      >
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          {q.status !== "CANCELLED" && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(q.id)}
                              onChange={() => toggleSelect(q.id)}
                              className="rounded border-gray-300"
                            />
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-sm font-medium text-glowup-licorice">
                          <Link href={`/factures/${q.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {q.reference}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 hidden md:table-cell">
                          {new Date(q.issueDate).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          <span className={isExpired ? "text-red-600 text-sm font-medium" : "text-sm text-gray-600"}>
                            {new Date(q.validUntil).toLocaleDateString("fr-FR")}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <QuoteStatutBadge status={q.status} />
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-800">{q.marque?.nom ?? "-"}</td>
                        <td className="py-3 px-4 text-sm text-gray-600 hidden lg:table-cell">
                          {q.talent ? `${q.talent.prenom} ${q.talent.nom}` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right text-sm hidden lg:table-cell">{formatMoney(q.totalHT)}</td>
                        <td className="py-3 px-4 text-right text-sm font-medium">{formatMoney(q.totalTTC)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <FooterTotals items={quotesPaginated} type="quote" />
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalQuotes}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={(v) => {
                setPerPage(v);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* Bandeau info (onglet Factures) */}
      {isInvoices && !infoBannerClosed && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
          <span className="text-lg" aria-hidden>ℹ️</span>
          <div className="flex-1 min-w-0 text-sm text-gray-700">
            Créez, envoyez et suivez l&apos;état de vos factures depuis cette page. Les factures peuvent être envoyées par email, par courrier, ou sauvegardées en format PDF.{" "}
            <button
              type="button"
              onClick={() => {
                setModalType("FACTURE");
                setShowModal(true);
              }}
              className="font-medium text-[#1A1110] hover:underline"
            >
              Commencez par créer une nouvelle facture
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setInfoBannerClosed(true);
              if (typeof window !== "undefined") localStorage.setItem("factures-info-banner-closed", "1");
            }}
            className="p-1 text-gray-500 hover:text-gray-700 rounded"
            aria-label="Fermer le bandeau"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-glowup-licorice text-white shadow-lg z-40 safe-area-pb">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{selectedIds.size} élément(s) sélectionné(s)</span>
            <div className="flex items-center gap-2 flex-wrap">
              {isInvoices ? (
                <>
                  <button
                    onClick={handleBulkEnvoyerFactures}
                    disabled={bulkActionLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium disabled:opacity-50"
                  >
                    {bulkActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Envoyer
                  </button>
                  {role === "ADMIN" && (
                    <button
                      onClick={handleBulkMarquerPaye}
                      disabled={bulkActionLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium disabled:opacity-50"
                    >
                      {bulkActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Marquer payé
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={handleBulkConvertirDevis}
                  disabled={bulkActionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium disabled:opacity-50"
                >
                  {bulkActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                  Convertir en facture
                </button>
              )}
              <button
                onClick={handleBulkDownloadPdf}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Télécharger PDF
              </button>
              <button
                onClick={clearSelection}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium"
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <NouvelleFactureModal
          type={modalType}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchFactures();
            fetchQuotes();
          }}
        />
      )}
    </div>
  );
}

function FactureStatutBadge({ statut, isLate }: { statut: string; isLate?: boolean }) {
  if (isLate) {
    return (
      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-0.5 text-xs font-medium text-red-700">
        En retard
      </span>
    );
  }
  const config: Record<string, { label: string; className: string }> = {
    BROUILLON: {
      label: "Brouillon",
      className: "border border-gray-200 bg-gray-100 text-gray-600",
    },
    VALIDE: {
      label: "Enregistré",
      className: "border border-[#F5D68B] bg-[#FEF3E2] text-[#8B6914]",
    },
    ENVOYE: {
      label: "Envoyé",
      className: "border border-blue-200 bg-blue-50 text-blue-700",
    },
    PAYE: {
      label: "Payé",
      className: "border border-green-200 bg-green-50 text-green-700",
    },
    ANNULE: {
      label: "Annulé",
      className: "border border-gray-200 bg-gray-50 text-gray-400",
    },
    REFUSE: { label: "Refusé", className: "border border-red-200 bg-red-50 text-red-600" },
  };
  const c = config[statut] || { label: statut, className: "border border-gray-200 bg-gray-100 text-gray-600" };
  return <span className={`inline-flex rounded-full px-3 py-0.5 text-xs font-medium ${c.className}`}>{c.label}</span>;
}

function ClientCell({
  marqueId,
  marqueNom,
  contact,
  isCancelled,
}: {
  marqueId?: string;
  marqueNom?: string;
  contact?: { prenom: string; nom: string } | null;
  isCancelled: boolean;
}) {
  const content = (
    <div className="text-sm text-[#1A1110]">
      {contact && marqueNom ? (
        <>
          <div>À l&apos;attention de {[contact.prenom, contact.nom].filter(Boolean).join(" ")}</div>
          <div className="text-gray-600">au nom et pour le compte de {marqueNom}</div>
        </>
      ) : marqueNom ? (
        <span className="font-semibold">{marqueNom}</span>
      ) : (
        "-"
      )}
    </div>
  );
  if (isCancelled || !marqueId) return <div className={isCancelled ? "text-gray-400" : ""}>{content}</div>;
  return (
    <Link href={`/marques/${marqueId}`} onClick={(e) => e.stopPropagation()} className="block hover:underline">
      {content}
    </Link>
  );
}

function QuoteStatutBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    DRAFT: { label: "Brouillon", className: "bg-gray-100 text-gray-600" },
    REGISTERED: { label: "Enregistré", className: "bg-blue-50 text-blue-600" },
    SENT: { label: "Envoyé", className: "bg-amber-50 text-amber-600" },
    VIEWED: { label: "Vu", className: "bg-amber-50 text-amber-600" },
    ACCEPTED: { label: "Accepté", className: "bg-emerald-50 text-emerald-600" },
    DECLINED: { label: "Refusé", className: "bg-red-50 text-red-600" },
    EXPIRED: { label: "Expiré", className: "bg-red-50 text-red-600" },
    INVOICED: { label: "Facturé", className: "bg-green-100 text-green-700" },
    CANCELLED: { label: "Annulé", className: "bg-gray-100 text-gray-500" },
  };
  const c = config[status] || { label: status, className: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${c.className}`}>{c.label}</span>;
}

function FooterTotalsFactures({
  items,
}: {
  items: Array<{
    montantHT?: number;
    montantTTC?: number;
    statut?: string;
  }>;
}) {
  const list = Array.isArray(items) ? items : [];
  const byCurrency: Record<string, { ht: number; ttc: number; restantDu: number }> = {};
  list.forEach((item) => {
    const cur = "EUR";
    if (!byCurrency[cur]) byCurrency[cur] = { ht: 0, ttc: 0, restantDu: 0 };
    byCurrency[cur].ht += Number(item.montantHT ?? 0);
    byCurrency[cur].ttc += Number(item.montantTTC ?? 0);
    if (item.statut !== "PAYE") byCurrency[cur].restantDu += Number(item.montantTTC ?? 0);
  });
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return null;
  return (
    <div className="border-t-2 border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-sm font-bold text-[#1A1110] mb-2">Total des factures</div>
      <div className="flex flex-wrap gap-6 text-sm">
        {entries.map(([cur, { ht, ttc, restantDu }]) => (
          <div key={cur} className="flex items-center gap-4">
            <span className="font-medium text-[#1A1110]">
              {cur} : Total HT {formatMoney(ht)} | Total TTC {formatMoney(ttc)} | Restant dû{" "}
              <span className={restantDu > 0 ? "font-semibold text-red-600" : "text-green-600"}>
                {formatMoney(restantDu)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FooterTotals({
  items,
  type,
}: {
  items: Array<{ montantHT?: number; montantTTC?: number; totalHT?: number; totalTTC?: number; currency?: string }>;
  type: "invoice" | "quote";
}) {
  const byCurrency: Record<string, { ht: number; ttc: number }> = {};
  items.forEach((item) => {
    const currency = type === "invoice" ? "EUR" : (item.currency || "EUR");
    if (!byCurrency[currency]) byCurrency[currency] = { ht: 0, ttc: 0 };
    if (type === "invoice") {
      byCurrency[currency].ht += Number((item as any).montantHT ?? 0);
      byCurrency[currency].ttc += Number((item as any).montantTTC ?? 0);
    } else {
      byCurrency[currency].ht += Number((item as any).totalHT ?? 0);
      byCurrency[currency].ttc += Number((item as any).totalTTC ?? 0);
    }
  });
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return null;
  return (
    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 flex flex-wrap gap-6 text-sm">
      {entries.map(([cur, { ht, ttc }]) => (
        <span key={cur} className="font-medium text-glowup-licorice">
          {cur} : HT {formatMoney(ht)} — TTC {formatMoney(ttc)}
        </span>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
  onPerPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (p: number) => void;
  onPerPageChange: (p: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  return (
    <div className="border-t border-gray-100 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span>
          {total === 0 ? "0" : `${start} à ${end}`} sur {total}
        </span>
        <select
          value={perPage}
          onChange={(e) => onPerPageChange(Number(e.target.value))}
          className="border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white"
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <span className="text-gray-400">▾</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <span className="px-3 text-sm text-gray-600">
          &lt; Page {page} / {totalPages} &gt;
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function NouvelleFactureModal({
  type,
  onClose,
  onSuccess,
}: {
  type: "DEVIS" | "FACTURE";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [loadingCollabs, setLoadingCollabs] = useState(true);
  const [collaborations, setCollaborations] = useState<any[]>([]);
  const [selectedCollab, setSelectedCollab] = useState("");
  const [titre, setTitre] = useState("");

  useEffect(() => {
    fetch("/api/collaborations")
      .then((res) => res.json())
      .then((data) => {
        const all = Array.isArray(data) ? data : data.collaborations || [];
        setCollaborations(all.filter((c: any) => ["GAGNE", "EN_COURS", "PUBLIE", "FACTURE_RECUE"].includes(c.statut)));
        setLoadingCollabs(false);
      });
  }, []);

  const handleSubmit = async () => {
    if (!selectedCollab) return;
    setLoading(true);
    const collab = collaborations.find((c) => c.id === selectedCollab);
    const lignes =
      collab?.livrables?.map((l: any) => ({
        description: l.typeContenu,
        quantite: l.quantite,
        prixUnitaire: Number(l.prixUnitaire),
      })) || [];
    const res = await fetch("/api/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, collaborationId: selectedCollab, lignes, titre }),
    });
    if (res.ok) onSuccess();
    else alert("Erreur");
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{type === "DEVIS" ? "Nouveau devis" : "Nouvelle facture"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Collaboration *</label>
            {loadingCollabs ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <select
                value={selectedCollab}
                onChange={(e) => {
                  setSelectedCollab(e.target.value);
                  const c = collaborations.find((x) => x.id === e.target.value);
                  if (c) setTitre(`${c.talent.prenom} x ${c.marque.nom}`);
                }}
                className="w-full px-4 py-3 border rounded-xl"
              >
                <option value="">Sélectionner</option>
                {collaborations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.reference} - {c.talent.prenom} x {c.marque.nom}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Titre</label>
            <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} className="w-full px-4 py-3 border rounded-xl" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t">
          <button onClick={onClose} className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedCollab}
            className="px-6 py-2.5 bg-glowup-rose text-white rounded-xl disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMoney(amount: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0) + (currency === "EUR" ? " €" : currency === "GBP" ? " £" : " $");
}
