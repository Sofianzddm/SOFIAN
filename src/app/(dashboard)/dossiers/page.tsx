"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  TrendingUp,
  Handshake,
  Receipt,
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  ExternalLink,
  Euro,
  Building2,
  Package,
} from "lucide-react";
import Link from "next/link";

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
}

interface Marque {
  id: string;
  nom: string;
  secteur: string | null;
}

interface Negociation {
  id: string;
  reference: string;
  budgetMarque: number | null;
  budgetSouhaite: number | null;
  budgetFinal: number | null;
  statut: string;
  dateValidation: string | null;
  validateur: { prenom: string; nom: string } | null;
}

interface Document {
  id: string;
  reference: string;
  type: string;
  statut: string;
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  dateEmission: string;
  dateEcheance: string | null;
  datePaiement: string | null;
}

interface Collaboration {
  id: string;
  reference: string;
  createdAt: string;
  statut: string;
  source: string;
  montantBrut: number;
  commissionPercent: number;
  commissionEuros: number;
  montantNet: number;
  datePublication: string | null;
  factureTalentUrl: string | null;
  factureTalentRecueAt: string | null;
  paidAt: string | null;
  marque: Marque;
  negociation: Negociation | null;
  devis: Document | null;
  factureClient: Document | null;
}

interface Mois {
  moisKey: string;
  moisLabel: string;
  collaborations: Collaboration[];
}

interface DossierTalent {
  talent: Talent;
  mois: Mois[];
}

export default function DossiersPage() {
  const [dossiers, setDossiers] = useState<DossierTalent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTalents, setExpandedTalents] = useState<Set<string>>(new Set());
  const [expandedMois, setExpandedMois] = useState<Set<string>>(new Set());
  const [expandedCollabs, setExpandedCollabs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchDossiers();
  }, []);

  const fetchDossiers = async () => {
    try {
      const res = await fetch("/api/dossiers");
      if (res.ok) {
        const data = await res.json();
        setDossiers(data);
      } else if (res.status === 403) {
        alert("Accès réservé aux administrateurs");
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTalent = (talentId: string) => {
    const newSet = new Set(expandedTalents);
    if (newSet.has(talentId)) {
      newSet.delete(talentId);
    } else {
      newSet.add(talentId);
    }
    setExpandedTalents(newSet);
  };

  const toggleMois = (key: string) => {
    const newSet = new Set(expandedMois);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedMois(newSet);
  };

  const toggleCollab = (collabId: string) => {
    const newSet = new Set(expandedCollabs);
    if (newSet.has(collabId)) {
      newSet.delete(collabId);
    } else {
      newSet.add(collabId);
    }
    setExpandedCollabs(newSet);
  };

  const deployerTout = () => {
    const allTalents = new Set(dossiers.map((d) => d.talent.id));
    const allMois = new Set<string>();
    const allCollabs = new Set<string>();

    dossiers.forEach((dossier) => {
      dossier.mois.forEach((mois) => {
        allMois.add(`${dossier.talent.id}-${mois.moisKey}`);
        mois.collaborations.forEach((collab) => {
          allCollabs.add(collab.id);
        });
      });
    });

    setExpandedTalents(allTalents);
    setExpandedMois(allMois);
    setExpandedCollabs(allCollabs);
  };

  const replierTout = () => {
    setExpandedTalents(new Set());
    setExpandedMois(new Set());
    setExpandedCollabs(new Set());
  };

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);

  const getStatutColor = (statut: string) => {
    const colors: Record<string, string> = {
      BROUILLON: "bg-gray-100 text-gray-600",
      EN_ATTENTE: "bg-amber-50 text-amber-600",
      ENVOYE: "bg-blue-50 text-blue-600",
      PAYE: "bg-green-50 text-green-600",
      ANNULE: "bg-red-50 text-red-600",
      VALIDEE: "bg-green-50 text-green-600",
      PUBLIE: "bg-violet-50 text-violet-600",
      FACTURE_RECUE: "bg-orange-50 text-orange-600",
    };
    return colors[statut] || "bg-gray-100 text-gray-600";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const totalCollabs = dossiers.reduce((acc, d) => 
    acc + d.mois.reduce((sum, m) => sum + m.collaborations.length, 0), 0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-glowup-licorice mb-2">📁 Dossiers Complets</h1>
        <p className="text-gray-500">
          {dossiers.length} talent(s) • {totalCollabs} collaboration(s)
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={deployerTout}
          className="px-4 py-2 text-sm text-gray-600 hover:text-glowup-licorice bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Tout déplier
        </button>
        <button
          onClick={replierTout}
          className="px-4 py-2 text-sm text-gray-600 hover:text-glowup-licorice bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Tout replier
        </button>
      </div>

      {/* Liste hiérarchique */}
      <div className="space-y-2">
        {dossiers.map((dossier) => {
          const isTalentExpanded = expandedTalents.has(dossier.talent.id);

          return (
            <div key={dossier.talent.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Niveau 1 : Talent */}
              <button
                onClick={() => toggleTalent(dossier.talent.id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
              >
                {isTalentExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-glowup-rose to-glowup-old flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {dossier.talent.photo ? (
                    <img src={dossier.talent.photo} alt={dossier.talent.prenom} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-semibold text-sm">
                      {dossier.talent.prenom.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-glowup-licorice">
                    {dossier.talent.prenom} {dossier.talent.nom}
                  </p>
                </div>
              </button>

              {/* Niveau 2 : Mois */}
              {isTalentExpanded && (
                <div className="pl-16 pr-4 pb-4 space-y-2">
                  {dossier.mois.map((mois) => {
                    const moisKey = `${dossier.talent.id}-${mois.moisKey}`;
                    const isMoisExpanded = expandedMois.has(moisKey);
                    const totalMois = mois.collaborations.reduce((sum, c) => sum + Number(c.montantBrut), 0);

                    return (
                      <div key={moisKey} className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                        <button
                          onClick={() => toggleMois(moisKey)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 transition-colors"
                        >
                          {isMoisExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <span className="text-2xl flex-shrink-0">📅</span>
                          <div className="flex-1 flex items-center justify-between text-left">
                            <div>
                              <p className="font-medium text-gray-900 capitalize">{mois.moisLabel}</p>
                              <p className="text-xs text-gray-500">
                                {mois.collaborations.length} collaboration(s)
                              </p>
                            </div>
                            <p className="text-lg font-bold text-glowup-licorice">{formatMoney(totalMois)}</p>
                          </div>
                        </button>

                        {/* Niveau 3 : Collaborations par marque */}
                        {isMoisExpanded && (
                          <div className="px-3 pb-3 space-y-2">
                            {mois.collaborations.map((collab) => {
                              const isCollabExpanded = expandedCollabs.has(collab.id);

                              return (
                                <div key={collab.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                  <div className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                                    <button
                                      onClick={() => toggleCollab(collab.id)}
                                      className="flex items-center gap-3 flex-shrink-0"
                                    >
                                      {isCollabExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                      )}
                                    </button>
                                    
                                    <Building2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                    
                                    <div className="flex-1 flex items-center justify-between gap-4">
                                      <div>
                                        <p className="font-semibold text-glowup-licorice">{collab.marque.nom}</p>
                                        <p className="text-xs text-gray-500">{collab.reference}</p>
                                      </div>
                                      
                                      <div className="flex items-center gap-4">
                                        <div className="text-right">
                                          <p className="font-bold text-glowup-licorice">{formatMoney(Number(collab.montantBrut))}</p>
                                          <p className="text-xs text-gray-500">Net: {formatMoney(Number(collab.montantNet))}</p>
                                        </div>
                                        
                                        {/* Bouton "Voir le dossier complet" */}
                                        <Link
                                          href={`/dossiers/${collab.id}`}
                                          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                                        >
                                          <FileText className="w-4 h-4" />
                                          Voir le dossier
                                        </Link>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Historique complet */}
                                  {isCollabExpanded && (
                                    <div className="p-4 space-y-3 bg-gray-50">
                                      {/* 1. Négociation */}
                                      {collab.negociation && (
                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                          <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                              <TrendingUp className="w-4 h-4 text-amber-600" />
                                            </div>
                                            <div className="flex-1">
                                              <p className="font-medium text-gray-900 mb-1">1. Négociation</p>
                                              <div className="space-y-1 text-sm">
                                                <p className="text-gray-600">
                                                  Référence: <span className="font-mono">{collab.negociation.reference}</span>
                                                </p>
                                                {collab.negociation.budgetFinal && (
                                                  <p className="text-gray-600">
                                                    Budget final: <span className="font-semibold text-green-600">{formatMoney(Number(collab.negociation.budgetFinal))}</span>
                                                  </p>
                                                )}
                                                <span className={`inline-flex text-xs px-2 py-1 rounded-full ${getStatutColor(collab.negociation.statut)}`}>
                                                  {collab.negociation.statut}
                                                </span>
                                              </div>
                                              <Link
                                                href={`/negociations/${collab.negociation.id}`}
                                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                                              >
                                                <ExternalLink className="w-3 h-3" /> Voir la négociation
                                              </Link>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* 2. Devis */}
                                      {collab.devis && (
                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                          <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                              <FileText className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div className="flex-1">
                                              <p className="font-medium text-gray-900 mb-1">2. Devis</p>
                                              <div className="space-y-1 text-sm">
                                                <p className="text-gray-600">
                                                  Référence: <span className="font-mono">{collab.devis.reference}</span>
                                                </p>
                                                <p className="text-gray-600">
                                                  Montant TTC: <span className="font-semibold">{formatMoney(Number(collab.devis.montantTTC))}</span>
                                                </p>
                                                <span className={`inline-flex text-xs px-2 py-1 rounded-full ${getStatutColor(collab.devis.statut)}`}>
                                                  {collab.devis.statut}
                                                </span>
                                              </div>
                                              <a
                                                href={`/api/documents/${collab.devis.id}/pdf`}
                                                target="_blank"
                                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                                              >
                                                <Download className="w-3 h-3" /> Télécharger PDF
                                              </a>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* 3. Collaboration */}
                                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                                        <div className="flex items-start gap-3">
                                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Handshake className="w-4 h-4 text-green-600" />
                                          </div>
                                          <div className="flex-1">
                                            <p className="font-medium text-gray-900 mb-1">3. Collaboration</p>
                                            <div className="space-y-1 text-sm">
                                              <p className="text-gray-600">
                                                Brut: <span className="font-semibold">{formatMoney(Number(collab.montantBrut))}</span>
                                              </p>
                                              <p className="text-gray-600">
                                                Commission: <span className="font-semibold text-glowup-rose">{formatMoney(Number(collab.commissionEuros))}</span> ({collab.commissionPercent}%)
                                              </p>
                                              <p className="text-gray-600">
                                                Net talent: <span className="font-semibold text-green-600">{formatMoney(Number(collab.montantNet))}</span>
                                              </p>
                                              {collab.datePublication && (
                                                <p className="text-gray-500 text-xs">
                                                  Publié le {new Date(collab.datePublication).toLocaleDateString("fr-FR")}
                                                </p>
                                              )}
                                              <span className={`inline-flex text-xs px-2 py-1 rounded-full ${getStatutColor(collab.statut)}`}>
                                                {collab.statut}
                                              </span>
                                            </div>
                                            <Link
                                              href={`/collaborations/${collab.id}`}
                                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                                            >
                                              <ExternalLink className="w-3 h-3" /> Voir la collaboration
                                            </Link>
                                          </div>
                                        </div>
                                      </div>

                                      {/* 4. Facture Client */}
                                      {collab.factureClient && (
                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                          <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                              <Receipt className="w-4 h-4 text-emerald-600" />
                                            </div>
                                            <div className="flex-1">
                                              <p className="font-medium text-gray-900 mb-1">4. Facture Client</p>
                                              <div className="space-y-1 text-sm">
                                                <p className="text-gray-600">
                                                  Référence: <span className="font-mono">{collab.factureClient.reference}</span>
                                                </p>
                                                <p className="text-gray-600">
                                                  Montant TTC: <span className="font-semibold">{formatMoney(Number(collab.factureClient.montantTTC))}</span>
                                                </p>
                                                {collab.factureClient.datePaiement ? (
                                                  <p className="text-green-600 text-xs flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Payé le {new Date(collab.factureClient.datePaiement).toLocaleDateString("fr-FR")}
                                                  </p>
                                                ) : (
                                                  <p className="text-amber-600 text-xs flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    En attente de paiement
                                                  </p>
                                                )}
                                              </div>
                                              <a
                                                href={`/api/documents/${collab.factureClient.id}/pdf`}
                                                target="_blank"
                                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                                              >
                                                <Download className="w-3 h-3" /> Télécharger PDF
                                              </a>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* 5. Facture Talent */}
                                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                                        <div className="flex items-start gap-3">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            collab.factureTalentUrl ? "bg-violet-100" : "bg-gray-100"
                                          }`}>
                                            <Upload className={`w-4 h-4 ${collab.factureTalentUrl ? "text-violet-600" : "text-gray-400"}`} />
                                          </div>
                                          <div className="flex-1">
                                            <p className="font-medium text-gray-900 mb-1">5. Facture Talent</p>
                                            {collab.factureTalentUrl ? (
                                              <div className="space-y-1 text-sm">
                                                <p className="text-gray-600">
                                                  Montant: <span className="font-semibold">{formatMoney(Number(collab.montantNet))}</span>
                                                </p>
                                                <p className="text-gray-500 text-xs">
                                                  Reçue le {collab.factureTalentRecueAt && new Date(collab.factureTalentRecueAt).toLocaleDateString("fr-FR")}
                                                </p>
                                                <a
                                                  href={collab.factureTalentUrl}
                                                  target="_blank"
                                                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                                                >
                                                  <Download className="w-3 h-3" /> Voir la facture
                                                </a>
                                              </div>
                                            ) : (
                                              <p className="text-gray-400 text-sm">⏳ En attente de la facture du talent</p>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* 6. Paiement Talent */}
                                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                                        <div className="flex items-start gap-3">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            collab.paidAt ? "bg-green-100" : "bg-gray-100"
                                          }`}>
                                            {collab.paidAt ? (
                                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                                            ) : (
                                              <XCircle className="w-4 h-4 text-gray-400" />
                                            )}
                                          </div>
                                          <div className="flex-1">
                                            <p className="font-medium text-gray-900 mb-1">6. Paiement Talent</p>
                                            {collab.paidAt ? (
                                              <div className="space-y-1">
                                                <p className="text-green-600 text-sm flex items-center gap-1">
                                                  <CheckCircle2 className="w-3 h-3" />
                                                  Payé le {new Date(collab.paidAt).toLocaleDateString("fr-FR")}
                                                </p>
                                                <p className="text-green-700 text-xs font-semibold">✅ Dossier clôturé</p>
                                              </div>
                                            ) : (
                                              <p className="text-gray-400 text-sm">⏳ En attente de paiement</p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {dossiers.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun dossier pour le moment</p>
        </div>
      )}
    </div>
  );
}
