"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Download,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Calendar,
  Building2,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  List,
  Users,
  ExternalLink,
} from "lucide-react";

type ViewMode = "list" | "byTalent";

interface DocumentInfo {
  id: string;
  reference: string;
  type: "DEVIS" | "FACTURE" | "AVOIR";
  statut: string;
  montantHT: number;
  montantTTC: number;
  createdAt: string;
  collaboration: {
    id: string;
    reference: string;
    talent: { id: string; prenom: string; nom: string };
    marque: { id: string; nom: string };
  } | null;
}

interface Stats {
  entreesMois: number;
  sortiesMois: number;
  caNetMois: number;
  entreesAnnee: number;
  sortiesAnnee: number;
  caNetAnnee: number;
  evolMois: number;
  facturesEnRetard: number;
  facturesEnAttente: number;
  talentsAPayer: number;
}

// Structure groupée
interface MarqueGroup {
  marqueId: string;
  marqueNom: string;
  collaborationId: string;
  collaborationRef: string;
  documents: DocumentInfo[];
  totalTTC: number;
}

interface MoisGroup {
  mois: string;
  moisLabel: string;
  marques: MarqueGroup[];
  totalTTC: number;
}

interface TalentGroup {
  talentId: string;
  talentNom: string;
  talentPrenom: string;
  moisGroups: MoisGroup[];
  totalTTC: number;
  documentsCount: number;
}

export default function FacturesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("byTalent");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statutFilter, setStatutFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedTalents, setExpandedTalents] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const [stats, setStats] = useState<Stats | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"DEVIS" | "FACTURE">("FACTURE");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [facRes, docRes] = await Promise.all([
        fetch("/api/factures"),
        fetch("/api/documents"),
      ]);

      if (facRes.ok) {
        const data = await facRes.json();
        setStats(data.stats);
      }

      if (docRes.ok) {
        const docs = await docRes.json();
        setDocuments(docs);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrage
  const filteredDocs = documents.filter((doc) => {
    if (!doc.collaboration) return false;
    const matchSearch =
      doc.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.collaboration.marque.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${doc.collaboration.talent.prenom} ${doc.collaboration.talent.nom}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatut = statutFilter === "all" || doc.statut === statutFilter;
    const matchType = typeFilter === "all" || doc.type === typeFilter;
    return matchSearch && matchStatut && matchType;
  });

  // Grouper par Talent > Mois > Marque
  const groupByTalent = (): TalentGroup[] => {
    const talentMap: Record<string, TalentGroup> = {};

    // D'abord, grouper les docs par collaboration et ne garder que les actifs
    const docsByCollab: Record<string, DocumentInfo[]> = {};
    filteredDocs.forEach((doc) => {
      if (!doc.collaboration) return;
      const collabId = doc.collaboration.id;
      if (!docsByCollab[collabId]) {
        docsByCollab[collabId] = [];
      }
      docsByCollab[collabId].push(doc);
    });

    // Pour chaque collab, calculer le montant net (factures actives - avoirs)
    const collabTotals: Record<string, { docs: DocumentInfo[]; total: number; activeFacture: DocumentInfo | null }> = {};
    
    Object.entries(docsByCollab).forEach(([collabId, docs]) => {
      // Trier par date (plus récent en premier)
      const sortedDocs = docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Trouver la dernière facture active (non annulée)
      const activeFacture = sortedDocs.find(d => d.type === "FACTURE" && d.statut !== "ANNULE") || null;
      
      // Calculer le total : dernière facture active - avoirs actifs
      let total = 0;
      if (activeFacture) {
        total = Number(activeFacture.montantTTC || 0);
      }
      
      // Soustraire les avoirs actifs
      sortedDocs.filter(d => d.type === "AVOIR" && d.statut !== "ANNULE").forEach(avoir => {
        total -= Number(avoir.montantTTC || 0);
      });

      collabTotals[collabId] = { docs: sortedDocs, total, activeFacture };
    });

    // Maintenant construire les groupes
    Object.entries(collabTotals).forEach(([collabId, { docs, total, activeFacture }]) => {
      if (docs.length === 0) return;
      
      const firstDoc = docs[0];
      if (!firstDoc.collaboration) return;

      const { talent, marque, id, reference: collabRef } = firstDoc.collaboration;
      const talentKey = talent.id;

      // Créer le groupe talent si nécessaire
      if (!talentMap[talentKey]) {
        talentMap[talentKey] = {
          talentId: talent.id,
          talentNom: talent.nom,
          talentPrenom: talent.prenom,
          moisGroups: [],
          totalTTC: 0,
          documentsCount: 0,
        };
      }

      // Calculer le mois (basé sur la facture active ou le premier doc)
      const refDoc = activeFacture || firstDoc;
      const date = new Date(refDoc.createdAt);
      const moisKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const moisLabel = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

      // Trouver ou créer le groupe mois
      let moisGroup = talentMap[talentKey].moisGroups.find((m) => m.mois === moisKey);
      if (!moisGroup) {
        moisGroup = { mois: moisKey, moisLabel, marques: [], totalTTC: 0 };
        talentMap[talentKey].moisGroups.push(moisGroup);
      }

      // Ajouter le groupe marque (une seule entrée par collab)
      moisGroup.marques.push({
        marqueId: marque.id,
        marqueNom: marque.nom,
        collaborationId: id,
        collaborationRef: collabRef,
        documents: docs,
        totalTTC: total,
      });

      moisGroup.totalTTC += total;
      talentMap[talentKey].totalTTC += total;
      talentMap[talentKey].documentsCount += docs.length;
    });

    // Trier les mois (plus récent en premier) et les marques
    Object.values(talentMap).forEach((talent) => {
      talent.moisGroups.sort((a, b) => b.mois.localeCompare(a.mois));
      talent.moisGroups.forEach((mois) => {
        mois.marques.sort((a, b) => a.marqueNom.localeCompare(b.marqueNom));
      });
    });

    return Object.values(talentMap).sort((a, b) => a.talentPrenom.localeCompare(b.talentPrenom));
  };

  const talentGroups = groupByTalent();

  const toggleTalent = (talentId: string) => {
    const newExpanded = new Set(expandedTalents);
    if (newExpanded.has(talentId)) {
      newExpanded.delete(talentId);
    } else {
      newExpanded.add(talentId);
    }
    setExpandedTalents(newExpanded);
  };

  const toggleMonth = (key: string) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedMonths(newExpanded);
  };

  const expandAll = () => {
    setExpandedTalents(new Set(talentGroups.map((g) => g.talentId)));
    const allMonths = new Set<string>();
    talentGroups.forEach((g) => {
      g.moisGroups.forEach((m) => allMonths.add(`${g.talentId}-${m.mois}`));
    });
    setExpandedMonths(allMonths);
  };

  const collapseAll = () => {
    setExpandedTalents(new Set());
    setExpandedMonths(new Set());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">Documents & Facturation</h1>
          <p className="text-gray-500 mt-1">Devis, factures et avoirs</p>
        </div>
        <div className="flex gap-3">
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 bg-glowup-licorice text-white rounded-lg hover:bg-glowup-licorice/90 transition-colors">
              <Plus className="w-4 h-4" />
              Nouveau document
              <ChevronDown className="w-4 h-4" />
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button onClick={() => { setModalType("DEVIS"); setShowModal(true); }} className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                Nouveau devis
              </button>
              <button onClick={() => { setModalType("FACTURE"); setShowModal(true); }} className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100">
                <FileText className="w-4 h-4 text-emerald-500" />
                Nouvelle facture
              </button>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
            <div className="flex items-center justify-between">
              <p className="text-white/80 text-sm">CA Net du mois</p>
              {stats.evolMois !== 0 && (
                <span className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${stats.evolMois > 0 ? "bg-white/20" : "bg-red-500/30"}`}>
                  {stats.evolMois > 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                  {stats.evolMois > 0 ? "+" : ""}{stats.evolMois}%
                </span>
              )}
            </div>
            <p className="text-3xl font-bold mt-2">{formatMoney(stats.caNetMois)}</p>
            <div className="mt-3 pt-3 border-t border-white/20 flex justify-between text-sm">
              <span className="text-white/70">Entrées: {formatMoney(stats.entreesMois)}</span>
              <span className="text-white/70">Sorties: {formatMoney(stats.sortiesMois)}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-sm">CA Net (Année)</p>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-glowup-licorice mt-2">{formatMoney(stats.caNetAnnee)}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-sm">En attente</p>
              <div className="p-2 bg-yellow-50 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-glowup-licorice mt-2">{stats.facturesEnAttente}</p>
            <p className="text-xs text-gray-500 mt-1">factures à encaisser</p>
          </div>

          <div className={`rounded-xl shadow-sm border p-5 ${stats.facturesEnRetard > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm ${stats.facturesEnRetard > 0 ? "text-red-600" : "text-gray-500"}`}>Alertes</p>
              <div className={`p-2 rounded-lg ${stats.facturesEnRetard > 0 ? "bg-red-100" : "bg-gray-50"}`}>
                <AlertTriangle className={`w-5 h-5 ${stats.facturesEnRetard > 0 ? "text-red-600" : "text-gray-400"}`} />
              </div>
            </div>
            {stats.facturesEnRetard > 0 ? (
              <p className="text-sm font-medium text-red-700 mt-2">{stats.facturesEnRetard} en retard</p>
            ) : (
              <p className="text-sm text-gray-500 mt-2">Aucune alerte</p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex flex-1 gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-glowup-rose"
              />
            </div>

            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="all">Tous les types</option>
              <option value="DEVIS">Devis</option>
              <option value="FACTURE">Factures</option>
              <option value="AVOIR">Avoirs</option>
            </select>

            <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="all">Tous les statuts</option>
              <option value="BROUILLON">Brouillon</option>
              <option value="ENVOYE">Facturé</option>
              <option value="PAYE">Payé</option>
              <option value="ANNULE">Annulé</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "list" ? "bg-white text-glowup-licorice shadow-sm" : "text-gray-500"}`}
            >
              <List className="w-4 h-4" />
              Liste
            </button>
            <button
              onClick={() => setViewMode("byTalent")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "byTalent" ? "bg-white text-glowup-licorice shadow-sm" : "text-gray-500"}`}
            >
              <Users className="w-4 h-4" />
              Par Talent
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {viewMode === "list" ? (
          /* === VUE LISTE === */
          filteredDocs.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Aucun document trouvé</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Référence</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Talent</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Marque</th>
                  <th className="text-center py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Montant</th>
                  <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className={`hover:bg-gray-50/50 ${doc.statut === "ANNULE" ? "opacity-50" : ""}`}>
                    <td className="py-4 px-6">
                      <span className={`font-mono font-medium ${doc.statut === "ANNULE" ? "line-through text-gray-400" : "text-glowup-licorice"}`}>
                        {doc.reference}
                      </span>
                    </td>
                    <td className="py-4 px-6"><TypeBadge type={doc.type} /></td>
                    <td className="py-4 px-6 text-sm text-gray-700">
                      {doc.collaboration?.talent.prenom} {doc.collaboration?.talent.nom}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">{doc.collaboration?.marque.nom}</td>
                    <td className="py-4 px-6 text-center"><StatutBadge statut={doc.statut} /></td>
                    <td className="py-4 px-6 text-right">
                      <span className={`font-semibold ${doc.type === "AVOIR" ? "text-orange-600" : "text-emerald-600"}`}>
                        {doc.type === "AVOIR" ? "-" : "+"}{formatMoney(doc.montantTTC)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {doc.collaboration && (
                          <Link href={`/collaborations/${doc.collaboration.id}`} className="p-2 text-gray-400 hover:text-glowup-rose rounded-lg">
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        <a href={`/api/documents/${doc.id}/pdf`} target="_blank" className="p-2 text-gray-400 hover:text-glowup-rose rounded-lg">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          /* === VUE PAR TALENT === */
          <div>
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <span className="text-sm text-gray-500">{talentGroups.length} talent(s) • {filteredDocs.length} document(s)</span>
              <div className="flex gap-2">
                <button onClick={expandAll} className="text-xs text-glowup-rose hover:underline">Tout déplier</button>
                <span className="text-gray-300">|</span>
                <button onClick={collapseAll} className="text-xs text-gray-500 hover:underline">Tout replier</button>
              </div>
            </div>

            {talentGroups.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Aucun document trouvé</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {talentGroups.map((talent) => (
                  <div key={talent.talentId}>
                    {/* Talent Header */}
                    <button
                      onClick={() => toggleTalent(talent.talentId)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-glowup-rose to-glowup-old flex items-center justify-center">
                          <span className="text-white font-semibold text-lg">{talent.talentPrenom.charAt(0)}</span>
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-glowup-licorice text-lg">{talent.talentPrenom} {talent.talentNom}</p>
                          <p className="text-sm text-gray-500">{talent.documentsCount} document(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="font-bold text-xl text-emerald-600">{formatMoney(talent.totalTTC)}</p>
                          <p className="text-xs text-gray-400">Total</p>
                        </div>
                        {expandedTalents.has(talent.talentId) ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Mois */}
                    {expandedTalents.has(talent.talentId) && (
                      <div className="bg-gray-50/30">
                        {talent.moisGroups.map((moisGroup) => {
                          const monthKey = `${talent.talentId}-${moisGroup.mois}`;
                          return (
                            <div key={monthKey} className="border-t border-gray-100">
                              {/* Mois Header */}
                              <button
                                onClick={() => toggleMonth(monthKey)}
                                className="w-full px-6 py-3 pl-20 flex items-center justify-between hover:bg-gray-100/50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <Calendar className="w-4 h-4 text-gray-400" />
                                  <span className="font-medium text-gray-700 capitalize">{moisGroup.moisLabel}</span>
                                  <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                                    {moisGroup.marques.length} collab(s)
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-semibold text-gray-700">{formatMoney(moisGroup.totalTTC)}</span>
                                  {expandedMonths.has(monthKey) ? (
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                  )}
                                </div>
                              </button>

                              {/* Marques (Collabs) */}
                              {expandedMonths.has(monthKey) && (
                                <div className="pl-20 pr-6 pb-4 space-y-2">
                                  {moisGroup.marques.map((marque) => (
                                    <Link
                                      key={marque.collaborationId}
                                      href={`/collaborations/${marque.collaborationId}`}
                                      className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-glowup-rose/30 hover:shadow-md transition-all group"
                                    >
                                      <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-glowup-lace transition-colors">
                                          <Building2 className="w-5 h-5 text-gray-400 group-hover:text-glowup-rose transition-colors" />
                                        </div>
                                        <div>
                                          <p className="font-semibold text-glowup-licorice group-hover:text-glowup-rose transition-colors">
                                            {marque.marqueNom}
                                          </p>
                                          <p className="text-xs text-gray-400">{marque.collaborationRef} • {marque.documents.length} doc(s)</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        {/* Mini badges des types de docs */}
                                        <div className="flex gap-1">
                                          {marque.documents.some(d => d.type === "DEVIS") && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">D</span>
                                          )}
                                          {marque.documents.some(d => d.type === "FACTURE") && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600">F</span>
                                          )}
                                          {marque.documents.some(d => d.type === "AVOIR") && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">A</span>
                                          )}
                                        </div>
                                        <span className="font-bold text-emerald-600">{formatMoney(marque.totalTTC)}</span>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-glowup-rose group-hover:translate-x-1 transition-all" />
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <NouvelleFactureModal
          type={modalType}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}

// Components
function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; className: string }> = {
    DEVIS: { label: "Devis", className: "bg-blue-50 text-blue-600" },
    FACTURE: { label: "Facture", className: "bg-emerald-50 text-emerald-600" },
    AVOIR: { label: "Avoir", className: "bg-orange-50 text-orange-600" },
  };
  const c = config[type] || { label: type, className: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${c.className}`}>{c.label}</span>;
}

function StatutBadge({ statut }: { statut: string }) {
  const config: Record<string, { label: string; className: string }> = {
    BROUILLON: { label: "Brouillon", className: "bg-gray-100 text-gray-600" },
    ENVOYE: { label: "Facturé", className: "bg-emerald-50 text-emerald-600" },
    PAYE: { label: "Payé", className: "bg-green-100 text-green-700" },
    ANNULE: { label: "Annulé", className: "bg-red-50 text-red-500" },
  };
  const c = config[statut] || { label: statut, className: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${c.className}`}>{c.label}</span>;
}

function NouvelleFactureModal({ type, onClose, onSuccess }: { type: "DEVIS" | "FACTURE"; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [loadingCollabs, setLoadingCollabs] = useState(true);
  const [collaborations, setCollaborations] = useState<any[]>([]);
  const [selectedCollab, setSelectedCollab] = useState("");
  const [titre, setTitre] = useState("");

  useEffect(() => {
    fetch("/api/collaborations").then(res => res.json()).then(data => {
      const all = Array.isArray(data) ? data : (data.collaborations || []);
      setCollaborations(all.filter((c: any) => ["GAGNE", "EN_COURS", "PUBLIE", "FACTURE_RECUE"].includes(c.statut)));
      setLoadingCollabs(false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!selectedCollab) return;
    setLoading(true);
    const collab = collaborations.find(c => c.id === selectedCollab);
    const lignes = collab?.livrables?.map((l: any) => ({
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
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Collaboration *</label>
            {loadingCollabs ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <select value={selectedCollab} onChange={(e) => { setSelectedCollab(e.target.value); const c = collaborations.find(x => x.id === e.target.value); if (c) setTitre(`${c.talent.prenom} x ${c.marque.nom}`); }} className="w-full px-4 py-3 border rounded-xl">
                <option value="">Sélectionner</option>
                {collaborations.map(c => <option key={c.id} value={c.id}>{c.reference} - {c.talent.prenom} x {c.marque.nom}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Titre</label>
            <input type="text" value={titre} onChange={e => setTitre(e.target.value)} className="w-full px-4 py-3 border rounded-xl" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t">
          <button onClick={onClose} className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl">Annuler</button>
          <button onClick={handleSubmit} disabled={loading || !selectedCollab} className="px-6 py-2.5 bg-glowup-rose text-white rounded-xl disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount || 0);
}