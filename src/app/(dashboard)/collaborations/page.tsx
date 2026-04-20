"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Handshake,
  Eye,
  Euro,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  Package,
  Download,
} from "lucide-react";

interface Livrable {
  id: string;
  typeContenu: string;
  quantite: number;
  prixUnitaire: number;
}

interface Collaboration {
  id: string;
  reference: string;
  quoteReference: string | null;
  invoiceReference?: string | null;
  invoiceObject?: string | null;
  invoiceDate?: string | null;
  source: string;
  livrables: Livrable[];
  montantBrut: number;
  commissionPercent: number;
  commissionEuros: number;
  montantNet: number;
  statut: string;
  raisonPerdu: string | null;
  createdAt: string;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
    managerId?: string;
    manager?: { prenom: string; nom: string } | null;
    delegations?: { actif: boolean }[];
  };
  marque: { id: string; nom: string };
}

const STATUTS = [
  { value: "NEGO", label: "En négo", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  { value: "GAGNE", label: "Gagné", color: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  { value: "PERDU", label: "Perdu", color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  { value: "EN_COURS", label: "En cours", color: "bg-blue-50 text-blue-700 border-blue-200", icon: ArrowRight },
  { value: "PUBLIE", label: "Publié", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Eye },
  { value: "FACTURE_RECUE", label: "Facturé", color: "bg-orange-50 text-orange-700 border-orange-200", icon: FileText },
  { value: "PAYE", label: "Payé", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Euro },
];

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story", POST: "Post", REEL: "Reel", TIKTOK_VIDEO: "TikTok",
  YOUTUBE_VIDEO: "YouTube", YOUTUBE_SHORT: "Short", EVENT: "Event",
  SHOOTING: "Shooting", AMBASSADEUR: "Ambassadeur",
};

export default function CollaborationsPage() {
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [exporting, setExporting] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    fetchCollaborations();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.role);
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  };

  const fetchCollaborations = async () => {
    try {
      const res = await fetch("/api/collaborations", { cache: "no-store" });
      setCollaborations(await res.json());
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthKey = (value: string | null | undefined) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 7);
  };

  const toNumber = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const filteredCollabs = collaborations.filter((collab) => {
    const matchSearch =
      collab.reference.toLowerCase().includes(search.toLowerCase()) ||
      `${collab.talent.prenom} ${collab.talent.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      collab.marque.nom.toLowerCase().includes(search.toLowerCase());
    const matchStatut = !filterStatut || collab.statut === filterStatut;
    const collabMonth = getMonthKey(collab.createdAt);
    const matchMonth = !filterMonth || collabMonth === filterMonth;
    return matchSearch && matchStatut && matchMonth;
  });

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "";
    return new Intl.DateTimeFormat("fr-FR").format(new Date(date));
  };
  const toDateOrNull = (date: string | null | undefined) => {
    if (!date) return null;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getStatutInfo = (statut: string) => STATUTS.find((s) => s.value === statut) || STATUTS[0];
  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

  const availableMonths = Array.from(
    new Set(collaborations.map((c) => getMonthKey(c.createdAt)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  const formatMonthLabel = (month: string) => {
    const [year, m] = month.split("-").map(Number);
    return monthFormatter.format(new Date(year, m - 1, 1));
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Collaborations");
      const isAdmin = userRole === "ADMIN";
      const exportMonthLabel = filterMonth ? formatMonthLabel(filterMonth) : "Tous";

      const columns: { header: string; key: string; width: number; style?: { numFmt?: string } }[] = [
        { header: "Mois", key: "mois", width: 20 },
        { header: "Date collab", key: "dateCollab", width: 15, style: { numFmt: "dd/mm/yyyy" } },
        { header: "N° devis", key: "numeroDevis", width: 18 },
        { header: "N° facture", key: "numeroFacture", width: 18 },
        { header: "Objet facture", key: "objetFacture", width: 40 },
        { header: "Date facturation", key: "dateFacturation", width: 18, style: { numFmt: "dd/mm/yyyy" } },
        { header: "Nom collab", key: "nomCollab", width: 40 },
        { header: "Montant HT talent", key: "montantHtTalent", width: 20, style: { numFmt: '#,##0.00" €"' } },
      ];

      if (isAdmin) {
        columns.push({
          header: "Montant HT agence",
          key: "montantHtAgence",
          width: 20,
          style: { numFmt: '#,##0.00" €"' },
        });
      }

      worksheet.columns = columns;

      let totalMontantTalent = 0;
      let totalMontantAgence = 0;
      filteredCollabs.forEach((collab) => {
        const montantTalent = toNumber(collab.montantNet);
        const montantAgence = toNumber(collab.commissionEuros);
        totalMontantTalent += montantTalent;
        totalMontantAgence += montantAgence;

        const rowData: Record<string, string | number | Date> = {
          mois: formatMonthLabel(getMonthKey(collab.createdAt)),
          dateCollab: toDateOrNull(collab.createdAt) || "",
          numeroDevis: collab.quoteReference ?? "",
          numeroFacture: collab.invoiceReference ?? "",
          objetFacture: collab.invoiceObject ?? "",
          dateFacturation: toDateOrNull(collab.invoiceDate || null) || "",
          nomCollab: `${collab.talent.prenom} ${collab.talent.nom} - ${collab.marque.nom}`,
          montantHtTalent: montantTalent,
        };

        if (isAdmin) {
          rowData.montantHtAgence = montantAgence;
        }

        worksheet.addRow(rowData);
      });

      worksheet.getRow(1).font = { bold: true };
      const totalRowData: Record<string, string | number | Date> = {
        mois: "TOTAL",
        nomCollab: `${filteredCollabs.length} collab(s)`,
        montantHtTalent: totalMontantTalent,
      };
      if (isAdmin) totalRowData.montantHtAgence = totalMontantAgence;
      const totalRow = worksheet.addRow(totalRowData);
      totalRow.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `collaborations-${exportMonthLabel.replace(/\s+/g, "-").toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur export Excel:", error);
    } finally {
      setExporting(false);
    }
  };

  // Résumé des livrables
  const getLivrablesLabel = (livrables: Livrable[]) => {
    if (livrables.length === 0) return "-";
    if (livrables.length === 1) {
      const l = livrables[0];
      const label = TYPE_LABELS[l.typeContenu] || l.typeContenu;
      return l.quantite > 1 ? `${l.quantite}x ${label}` : label;
    }
    const total = livrables.reduce((acc, l) => acc + l.quantite, 0);
    return `${total} livrables`;
  };

  // Stats
  const totalCA = filteredCollabs
    .filter((c) => !["PERDU", "NEGO"].includes(c.statut))
    .reduce((acc, c) => acc + toNumber(c.montantBrut), 0);
  const totalCommission = filteredCollabs
    .filter((c) => !["PERDU", "NEGO"].includes(c.statut))
    .reduce((acc, c) => acc + toNumber(c.commissionEuros), 0);
  const enNego = filteredCollabs.filter((c) => c.statut === "NEGO").length;
  const gagnes = filteredCollabs.filter((c) => !["PERDU", "NEGO"].includes(c.statut)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">Collaborations</h1>
          <p className="text-gray-500 mt-1">{filteredCollabs.length} collaboration(s) (sur {collaborations.length})</p>
        </div>
        <Link
          href="/collaborations/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-glowup-licorice text-white font-medium rounded-xl hover:bg-glowup-licorice/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle collab
        </Link>
      </div>

      {/* Stats - Masqués pour TM */}
      {userRole !== "TM" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">CA confirmé</p>
                <p className="text-2xl font-bold text-glowup-licorice mt-1">{formatMoney(totalCA)}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl"><Euro className="w-5 h-5 text-green-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Commissions</p>
                <p className="text-2xl font-bold text-glowup-rose mt-1">{formatMoney(totalCommission)}</p>
              </div>
              <div className="p-3 bg-glowup-lace rounded-xl"><TrendingUp className="w-5 h-5 text-glowup-rose" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">En négo</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{enNego}</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl"><Clock className="w-5 h-5 text-amber-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Gagnées</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{gagnes}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl"><Handshake className="w-5 h-5 text-green-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4">
            <p className="text-sm text-gray-500">Total collaborations (filtre actif)</p>
            <p className="text-xl font-bold text-glowup-licorice mt-1">{filteredCollabs.length}</p>
          </div>
        </div>
      )}

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
            className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice appearance-none bg-white text-sm min-w-[140px]"
          >
            <option value="">Tous statuts</option>
            {STATUTS.filter((s) => s.value !== "PAYE" || userRole === "ADMIN").map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice appearance-none bg-white text-sm min-w-[170px]"
          >
            <option value="">Tous les mois</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || filteredCollabs.length === 0}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>
        ) : filteredCollabs.length === 0 ? (
          <div className="p-12 text-center">
            <Handshake className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Aucune collaboration</p>
            <Link href="/collaborations/new" className="inline-flex items-center gap-2 px-4 py-2 bg-glowup-licorice text-white text-sm font-medium rounded-lg">
              <Plus className="w-4 h-4" />Créer
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Ref</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Talent</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Marque</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Livrables</th>
                {userRole !== "TM" && <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Brut</th>}
                {userRole !== "TM" && <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Commission</th>}
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCollabs.map((collab) => {
                const statutInfo = getStatutInfo(collab.statut);
                return (
                  <tr key={collab.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-glowup-licorice">{collab.reference}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          collab.source === "INBOUND" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                        }`}>
                          {collab.source === "INBOUND" ? "IN" : "OUT"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-glowup-lace flex items-center justify-center text-xs font-semibold text-glowup-rose overflow-hidden">
                            {collab.talent.photo ? (
                              <img src={collab.talent.photo} alt={collab.talent.prenom} className="w-full h-full object-cover" />
                            ) : (
                              collab.talent.prenom.charAt(0)
                            )}
                          </div>
                          <span className="text-sm text-glowup-licorice">
                            {collab.talent.prenom} {collab.talent.nom.charAt(0)}.
                          </span>
                        </div>
                        {collab.talent.delegations?.some((d) => d.actif) &&
                          collab.talent.manager && (
                            <span className="inline-flex w-fit text-[10px] px-2 py-0.5 rounded-full bg-[#F5EBE0] text-[#C08B8B] border border-[#C08B8B] font-medium">
                              Relai · {collab.talent.manager.prenom} {collab.talent.manager.nom}
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">{collab.marque.nom}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm text-gray-600">{getLivrablesLabel(collab.livrables)}</span>
                      </div>
                    </td>
                    {userRole !== "TM" && (
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-semibold text-glowup-licorice">{formatMoney(collab.montantBrut)}</span>
                      </td>
                    )}
                    {userRole !== "TM" && (
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm text-glowup-rose font-medium">{formatMoney(collab.commissionEuros)}</span>
                        <span className="text-xs text-gray-400 ml-1">({collab.commissionPercent}%)</span>
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${statutInfo.color}`}>
                        <statutInfo.icon className="w-3 h-3" />
                        {statutInfo.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/collaborations/${collab.id}`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-glowup-licorice">
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
