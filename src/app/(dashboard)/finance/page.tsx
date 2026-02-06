"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Building2,
  FileText,
  AlertTriangle,
  Loader2,
  Calendar,
  Download,
  Euro,
  CheckCircle2,
  Clock,
  BarChart3,
  Target,
  Zap,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface FinanceStats {
  caTotal: number;
  caPaye: number;
  caEnAttente: number;
  commissionsTotal: number;
  commissionsPayees: number;
  netsTotal: number;
  netsPayes: number;
  netsEnAttente: number;
  nbCollaborations: number;
  nbCollabsPayees: number;
  nbCollabsEnAttente: number;
  nbFactures: number;
  nbFacturesPayees: number;
  nbFacturesEnAttente: number;
  nbFacturesRetard: number;
  ticketMoyen: number;
  margeMoyenne: number;
  delaiPaiementMoyen: number;
  evolutionVsPeriodePrecedente: number;
  evolutionVsAnnePrecedente: number;
}

interface CAParMois {
  mois: string;
  moisLabel: string;
  caHT: number;
  caTTC: number;
  commissions: number;
  nbCollabs: number;
}

interface RepartitionItem {
  label: string;
  value: number;
  pourcentage: number;
  count: number;
}

interface Repartitions {
  talents: RepartitionItem[];
  marques: RepartitionItem[];
  sources: RepartitionItem[];
}

interface Conversion {
  nbNegociations: number;
  nbValidees: number;
  nbRefusees: number;
  nbCollaborations: number;
  tauxValidation: number;
  tauxRefus: number;
  tauxConversion: number;
}

interface Prevision {
  caPrevisionnel: number;
  nbNegosEnCours: number;
  caEnCours: number;
  nbCollabsEnCours: number;
  caTotal: number;
}

// Couleurs Glow Up
const COLORS = {
  rose: "#EA4C89",
  roseDark: "#C73866",
  purple: "#9333EA",
  green: "#10B981",
  emerald: "#059669",
  blue: "#3B82F6",
  indigo: "#4F46E5",
  amber: "#F59E0B",
  red: "#EF4444",
};

const PIE_COLORS = [COLORS.green, COLORS.blue, COLORS.purple, COLORS.amber, COLORS.rose];

export default function FinancePage() {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [evolution, setEvolution] = useState<CAParMois[]>([]);
  const [repartitions, setRepartitions] = useState<Repartitions | null>(null);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [prevision, setPrevision] = useState<Prevision | null>(null);
  
  // Filtres
  const [periodeType, setPeriodeType] = useState<"mois" | "annee" | "custom">("mois");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [poleFilter, setPoleFilter] = useState<"ALL" | "INFLUENCE" | "SALES">("ALL");

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/finance/analytics?type=${periodeType}`;
      let evolutionUrl = `/api/finance/evolution?nbMois=12`;
      let repartitionUrl = `/api/finance/repartition`;
      let conversionUrl = `/api/finance/conversion`;
      
      // Ajouter filtre pôle si sélectionné
      const poleParam = poleFilter !== "ALL" ? `&pole=${poleFilter}` : "";

      if (periodeType === "custom" && dateDebut && dateFin) {
        url = `/api/finance/analytics?dateDebut=${dateDebut}&dateFin=${dateFin}${poleParam}`;
        conversionUrl = `/api/finance/conversion?dateDebut=${dateDebut}&dateFin=${dateFin}${poleParam}`;
        evolutionUrl = `/api/finance/evolution?nbMois=12${poleParam}`;
        repartitionUrl = `/api/finance/repartition${poleParam ? `?${poleParam.slice(1)}` : ""}`;
      } else {
        url += poleParam;
        evolutionUrl += poleParam;
        repartitionUrl += poleParam ? `?${poleParam.slice(1)}` : "";
        conversionUrl += poleParam ? `?${poleParam.slice(1)}` : "";
      }

      const [statsRes, evolutionRes, repartitionsRes, conversionRes, previsionRes] = await Promise.all([
        fetch(url),
        fetch(evolutionUrl),
        fetch(repartitionUrl),
        fetch(conversionUrl),
        fetch("/api/finance/prevision"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      if (evolutionRes.ok) {
        const data = await evolutionRes.json();
        setEvolution(data.evolution);
      }

      if (repartitionsRes.ok) {
        const data = await repartitionsRes.json();
        setRepartitions(data.repartitions);
      }

      if (conversionRes.ok) {
        const data = await conversionRes.json();
        setConversion(data.conversion);
      }

      if (previsionRes.ok) {
        const data = await previsionRes.json();
        setPrevision(data.prevision);
      }
    } catch (error) {
      console.error("Erreur fetch finance:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [periodeType, dateDebut, dateFin, poleFilter]);

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  const handleExport = async (format: "excel" | "csv") => {
    setExporting(true);
    try {
      const body: any = { format };
      if (periodeType === "custom" && dateDebut && dateFin) {
        body.dateDebut = dateDebut;
        body.dateFin = dateFin;
      }
      // Ajouter le filtre pôle si sélectionné
      if (poleFilter !== "ALL") {
        body.pole = poleFilter;
      }

      const res = await fetch("/api/finance/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rapport-finance-${new Date().toISOString().split("T")[0]}.${format === "excel" ? "xlsx" : "csv"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Erreur export:", error);
      alert("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  const applyPeriode = (type: "7j" | "30j" | "trimestre") => {
    const now = new Date();
    const debut = new Date();

    switch (type) {
      case "7j":
        debut.setDate(now.getDate() - 7);
        break;
      case "30j":
        debut.setDate(now.getDate() - 30);
        break;
      case "trimestre":
        debut.setMonth(now.getMonth() - 3);
        break;
    }

    setDateDebut(debut.toISOString().split("T")[0]);
    setDateFin(now.toISOString().split("T")[0]);
    setPeriodeType("custom");
    setShowDatePicker(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Aucune donnée disponible</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-glowup-lace via-white to-glowup-lace/30 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-glowup-licorice mb-2 flex items-center gap-3">
                📊 Finance & Analytics
                {poleFilter !== "ALL" && (
                  <span className="text-lg font-normal bg-gradient-to-r from-glowup-rose to-purple-600 text-white px-4 py-1 rounded-full">
                    {poleFilter === "INFLUENCE" ? "📱 Pôle Influence (INBOUND)" : "💼 Pôle Sales (OUTBOUND)"}
                  </span>
                )}
              </h1>
              <p className="text-gray-600">
                {poleFilter === "ALL" 
                  ? "Dashboard financier complet - Tous les pôles"
                  : poleFilter === "INFLUENCE"
                  ? "Vue du Pôle Influence (HEAD_OF_INFLUENCE + TM) - Collaborations entrantes"
                  : "Vue du Pôle Sales (HEAD_OF_SALES) - Prospection et collaborations sortantes"
                }
              </p>
            </div>

            {/* Filtres & Export */}
            <div className="flex gap-3 flex-wrap">
              {/* Filtres Pôle */}
              <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setPoleFilter("ALL")}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    poleFilter === "ALL"
                      ? "bg-white text-glowup-licorice shadow-sm"
                      : "text-gray-600 hover:text-glowup-licorice"
                  }`}
                >
                  🎯 Tous
                </button>
                <button
                  onClick={() => setPoleFilter("INFLUENCE")}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    poleFilter === "INFLUENCE"
                      ? "bg-white text-glowup-licorice shadow-sm"
                      : "text-gray-600 hover:text-glowup-licorice"
                  }`}
                >
                  📱 Pôle Influence
                </button>
                <button
                  onClick={() => setPoleFilter("SALES")}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    poleFilter === "SALES"
                      ? "bg-white text-glowup-licorice shadow-sm"
                      : "text-gray-600 hover:text-glowup-licorice"
                  }`}
                >
                  💼 Pôle Sales
                </button>
              </div>

              <div className="w-px h-10 bg-gray-200"></div>

              <button
                onClick={() => setPeriodeType("mois")}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  periodeType === "mois"
                    ? "bg-glowup-rose text-white shadow-lg"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                }`}
              >
                Mois en cours
              </button>
              <button
                onClick={() => setPeriodeType("annee")}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  periodeType === "annee"
                    ? "bg-glowup-rose text-white shadow-lg"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                }`}
              >
                Année en cours
              </button>
              
              {/* Date Picker */}
              <div className="relative">
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                    periodeType === "custom"
                      ? "bg-glowup-rose text-white shadow-lg"
                      : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  Personnalisé
                </button>
                
                {showDatePicker && (
                  <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50 min-w-[300px]">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-sm">Période personnalisée</h3>
                      <button
                        onClick={() => setShowDatePicker(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {/* Raccourcis */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => applyPeriode("7j")}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg"
                      >
                        7j
                      </button>
                      <button
                        onClick={() => applyPeriode("30j")}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg"
                      >
                        30j
                      </button>
                      <button
                        onClick={() => applyPeriode("trimestre")}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg"
                      >
                        Trimestre
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-600 block mb-1">Début</label>
                        <input
                          type="date"
                          value={dateDebut}
                          onChange={(e) => setDateDebut(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 block mb-1">Fin</label>
                        <input
                          type="date"
                          value={dateFin}
                          onChange={(e) => setDateFin(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setPeriodeType("custom");
                          setShowDatePicker(false);
                        }}
                        disabled={!dateDebut || !dateFin}
                        className="w-full px-4 py-2 bg-glowup-rose text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Export */}
              <button
                onClick={() => handleExport("excel")}
                disabled={exporting}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Excel
              </button>
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                CSV
              </button>
            </div>
          </div>
        </div>

        {/* ALERTES */}
        {stats.nbFacturesRetard > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 rounded-xl p-5 mb-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 mb-1">
                  ⚠️ {stats.nbFacturesRetard} facture{stats.nbFacturesRetard > 1 ? "s" : ""} en retard !
                </h3>
                <p className="text-sm text-red-700">
                  Action requise : relancer les clients pour encaisser {formatMoney(stats.caEnAttente)}
                </p>
              </div>
            </div>
          </div>
        )}

        {stats.evolutionVsPeriodePrecedente < -10 && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-l-4 border-amber-500 rounded-xl p-5 mb-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-amber-900 mb-1">
                  📉 Baisse du CA de {formatPercent(stats.evolutionVsPeriodePrecedente)}
                </h3>
                <p className="text-sm text-amber-700">
                  Le CA est en baisse par rapport à la période précédente. Analysez les causes.
                </p>
              </div>
            </div>
          </div>
        )}

        {conversion && conversion.tauxConversion < 50 && conversion.nbNegociations > 5 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-xl p-5 mb-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-blue-900 mb-1">
                  🎯 Taux de conversion faible : {conversion.tauxConversion.toFixed(1)}%
                </h3>
                <p className="text-sm text-blue-700">
                  Optimisez vos négociations pour améliorer le taux de conversion.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* KPIs Principaux */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {/* CA Total */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-glowup-rose to-glowup-rose-dark rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                stats.evolutionVsPeriodePrecedente >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {stats.evolutionVsPeriodePrecedente >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                {formatPercent(stats.evolutionVsPeriodePrecedente)}
              </div>
            </div>
            <h3 className="text-sm text-gray-600 font-medium mb-1">CA Total</h3>
            <p className="text-2xl font-bold text-glowup-licorice mb-2">
              {formatMoney(stats.caTotal)}
            </p>
            <p className="text-xs text-gray-500">
              {stats.nbCollaborations} collaboration{stats.nbCollaborations > 1 ? "s" : ""}
            </p>
          </div>

          {/* CA Payé */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-500">
                {((stats.caPaye / stats.caTotal) * 100).toFixed(0)}%
              </span>
            </div>
            <h3 className="text-sm text-gray-600 font-medium mb-1">CA Encaissé</h3>
            <p className="text-2xl font-bold text-green-600 mb-2">
              {formatMoney(stats.caPaye)}
            </p>
            <p className="text-xs text-gray-500">
              {stats.nbCollabsPayees} collaboration{stats.nbCollabsPayees > 1 ? "s" : ""}
            </p>
          </div>

          {/* CA En Attente */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-500">
                {stats.nbFacturesEnAttente} factures
              </span>
            </div>
            <h3 className="text-sm text-gray-600 font-medium mb-1">CA En attente</h3>
            <p className="text-2xl font-bold text-amber-600 mb-2">
              {formatMoney(stats.caEnAttente)}
            </p>
            <p className="text-xs text-red-600 font-medium">
              {stats.nbFacturesRetard > 0 ? `⚠️ ${stats.nbFacturesRetard} en retard` : "✓ Aucun retard"}
            </p>
          </div>

          {/* Commissions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Euro className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-500">
                {stats.margeMoyenne.toFixed(1)}% moy
              </span>
            </div>
            <h3 className="text-sm text-gray-600 font-medium mb-1">Commissions</h3>
            <p className="text-2xl font-bold text-purple-600 mb-2">
              {formatMoney(stats.commissionsTotal)}
            </p>
            <p className="text-xs text-gray-500">
              Marge: {stats.margeMoyenne.toFixed(1)}%
            </p>
          </div>

          {/* CA Prévisionnel */}
          {prevision && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 shadow-sm p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-medium text-indigo-600">
                  Prévisionnel
                </span>
              </div>
              <h3 className="text-sm text-gray-600 font-medium mb-1">CA Prévu</h3>
              <p className="text-2xl font-bold text-indigo-600 mb-2">
                {formatMoney(prevision.caTotal)}
              </p>
              <p className="text-xs text-gray-500">
                {prevision.nbNegosEnCours} négos + {prevision.nbCollabsEnCours} collabs
              </p>
            </div>
          )}
        </div>

        {/* Stats Secondaires */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Ticket moyen</p>
                <p className="text-lg font-bold text-glowup-licorice">
                  {formatMoney(stats.ticketMoyen)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Factures payées</p>
                <p className="text-lg font-bold text-glowup-licorice">
                  {stats.nbFacturesPayees} / {stats.nbFactures}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Délai paiement moy</p>
                <p className="text-lg font-bold text-glowup-licorice">
                  {Math.round(stats.delaiPaiementMoyen)} jours
                </p>
              </div>
            </div>
          </div>

          {conversion && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600">Taux conversion</p>
                  <p className="text-lg font-bold text-glowup-licorice">
                    {conversion.tauxConversion.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* GRAPHIQUES RECHARTS */}
        
        {/* 1. Line Chart - Évolution CA */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-glowup-licorice flex items-center gap-2">
              📈 Évolution du CA (12 derniers mois)
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-glowup-rose to-glowup-rose-dark"></div>
                <span className="text-gray-600">CA HT</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <span className="text-gray-600">Commissions</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={evolution}>
              <defs>
                <linearGradient id="colorCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.rose} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.rose} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCommissions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="moisLabel" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.split(" ")[0]}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px",
                }}
                formatter={(value: any) => [formatMoney(value), ""]}
                labelStyle={{ fontWeight: "bold", marginBottom: "8px" }}
              />
              <Area
                type="monotone"
                dataKey="caHT"
                stroke={COLORS.rose}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorCA)"
                name="CA HT"
              />
              <Area
                type="monotone"
                dataKey="commissions"
                stroke={COLORS.purple}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorCommissions)"
                name="Commissions"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* GRID 3 COLONNES */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* 2. Bar Chart - Conversions */}
          {conversion && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Taux de Conversion
              </h3>

              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={[
                    { name: "Négociations", value: conversion.nbNegociations, color: COLORS.blue },
                    { name: "Validées", value: conversion.nbValidees, color: COLORS.green },
                    { name: "Collabs créées", value: conversion.nbCollaborations, color: COLORS.rose },
                  ]}
                  layout="horizontal"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {[
                      { name: "Négociations", value: conversion.nbNegociations, color: COLORS.blue },
                      { name: "Validées", value: conversion.nbValidees, color: COLORS.green },
                      { name: "Collabs créées", value: conversion.nbCollaborations, color: COLORS.rose },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Taux validation</span>
                  <span className="font-bold text-green-600">
                    {conversion.tauxValidation.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Taux conversion</span>
                  <span className="font-bold text-glowup-rose">
                    {conversion.tauxConversion.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 3. Prévisions */}
          {prevision && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 shadow-sm p-6">
              <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Prévisions CA
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">CA Prévisionnel</span>
                    <span className="text-sm font-medium text-gray-500">
                      {prevision.nbNegosEnCours} négos
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-indigo-600">
                      {formatMoney(prevision.caPrevisionnel)}
                    </p>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-2 mt-2">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full"
                      style={{
                        width: `${(prevision.caPrevisionnel / prevision.caTotal) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">CA En Cours</span>
                    <span className="text-sm font-medium text-gray-500">
                      {prevision.nbCollabsEnCours} collabs
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-purple-600">
                      {formatMoney(prevision.caEnCours)}
                    </p>
                  </div>
                  <div className="w-full bg-purple-100 rounded-full h-2 mt-2">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-600 h-2 rounded-full"
                      style={{
                        width: `${(prevision.caEnCours / prevision.caTotal) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>

                <div className="pt-4 border-t border-indigo-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">TOTAL PRÉVU</span>
                    <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                      {formatMoney(prevision.caTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Pie Chart - Sources */}
          {repartitions && repartitions.sources.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Répartition Sources
              </h3>

              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={repartitions.sources}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {repartitions.sources.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.label === "INBOUND" ? COLORS.green : COLORS.blue}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                {repartitions.sources.map((item) => (
                  <div key={item.label} className="flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor:
                            item.label === "INBOUND" ? COLORS.green : COLORS.blue,
                        }}
                      ></div>
                      <span className="text-gray-600">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-glowup-licorice">
                        {formatMoney(item.value)}
                      </span>
                      <span className="text-gray-500 ml-2">({item.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Talents & Marques */}
        {repartitions && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Top Talents */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Top 10 Talents
              </h3>

              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={repartitions.talents.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                    }}
                    formatter={(value: any) => [formatMoney(value), "CA"]}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {repartitions.talents.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top Marques */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-glowup-licorice mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Top 10 Marques
              </h3>

              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={repartitions.marques.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                    }}
                    formatter={(value: any) => [formatMoney(value), "CA"]}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {repartitions.marques.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
