"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Receipt,
  TrendingUp,
  Building2,
  User,
  Calendar,
  Euro,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Download,
  Loader2,
} from "lucide-react";

interface DossierComplet {
  id: string;
  reference: string;
  statut: string;
  montantBrut: number;
  montantNet: number;
  commissionPercent: number;
  commissionEuros: number;
  dateDebut: string | null;
  dateFin: string | null;
  lienPublication: string | null;
  datePublication: string | null;
  paidAt: string | null;
  createdAt: string;
  
  talent: {
    id: string;
    prenom: string;
    nom: string;
    email: string;
    photo: string | null;
  };
  
  marque: {
    id: string;
    nom: string;
    secteur: string | null;
  };
  
  negociation: {
    id: string;
    reference: string;
    statut: string;
    budgetFinal: number | null;
    dateValidation: string | null;
  } | null;
  
  devis: {
    id: string;
    reference: string;
    statut: string;
    montantHT: number;
    montantTTC: number;
    dateEmission: string | null;
  } | null;
  
  factureClient: {
    id: string;
    reference: string;
    statut: string;
    montantHT: number;
    montantTTC: number;
    dateEmission: string | null;
    dateEcheance: string | null;
    datePaiement: string | null;
  } | null;
  
  factureTalentUrl: string | null;
  factureTalentRecueAt: string | null;
}

export default function DossierCompletPage() {
  const params = useParams();
  const router = useRouter();
  const [dossier, setDossier] = useState<DossierComplet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAsPaid, setMarkingAsPaid] = useState(false);

  useEffect(() => {
    fetchDossier();
  }, []);

  const fetchDossier = async () => {
    try {
      const res = await fetch(`/api/collaborations/${params.id}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError("Ce dossier n'est pas encore disponible. La collaboration doit être validée.");
        } else {
          setError("Erreur lors du chargement du dossier");
        }
        return;
      }
      const data = await res.json();
      
      // Vérifier que la collaboration est au moins validée
      if (["NEGO", "BROUILLON"].includes(data.statut)) {
        setError("Ce dossier n'est pas encore disponible. La collaboration doit être validée.");
        return;
      }
      
      setDossier(data);
    } catch (error) {
      console.error("Erreur:", error);
      setError("Erreur lors du chargement du dossier");
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };

  const getStatutColor = (statut: string) => {
    const colors: Record<string, string> = {
      VALIDEE: "bg-green-50 text-green-700 border-green-200",
      PUBLIE: "bg-blue-50 text-blue-700 border-blue-200",
      PAYE: "bg-emerald-50 text-emerald-700 border-emerald-200",
      EN_ATTENTE: "bg-amber-50 text-amber-700 border-amber-200",
      ENVOYE: "bg-purple-50 text-purple-700 border-purple-200",
    };
    return colors[statut] || "bg-gray-50 text-gray-700 border-gray-200";
  };

  const marquerFacturePayee = async (factureId: string) => {
    if (!confirm("Confirmer que cette facture a été payée par le client ?")) return;

    setMarkingAsPaid(true);
    try {
      const res = await fetch(`/api/documents/${factureId}/payer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datePaiement: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        alert("✅ Facture marquée comme payée !");
        fetchDossier(); // Recharger le dossier
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors du marquage");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors du marquage");
    } finally {
      setMarkingAsPaid(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-2">Dossier non disponible</h3>
              <p className="text-amber-700 text-sm mb-4">
                {error || "Ce dossier n'existe pas ou n'est pas encore accessible."}
              </p>
              <Link
                href="/dossiers"
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour aux dossiers
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dossiers"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-glowup-licorice mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux dossiers
        </Link>
        
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-glowup-licorice mb-2">📁 Dossier Complet</h1>
            <p className="text-lg text-gray-600">{dossier.reference}</p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-semibold border ${getStatutColor(dossier.statut)}`}>
            {dossier.statut}
          </span>
        </div>
      </div>

      {/* Résumé */}
      <div className="bg-gradient-to-br from-glowup-rose/10 to-glowup-old/10 rounded-2xl border border-gray-200 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Talent */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-glowup-rose to-glowup-old flex items-center justify-center overflow-hidden">
              {dossier.talent.photo ? (
                <img src={dossier.talent.photo} alt={dossier.talent.prenom} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-xl">
                  {dossier.talent.prenom.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Talent</p>
              <p className="font-bold text-glowup-licorice text-lg">
                {dossier.talent.prenom} {dossier.talent.nom}
              </p>
            </div>
          </div>

          {/* Marque */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Marque</p>
              <p className="font-bold text-glowup-licorice text-lg">{dossier.marque.nom}</p>
            </div>
          </div>

          {/* Montants */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <Euro className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Montant brut</p>
              <p className="font-bold text-emerald-600 text-lg">{formatMoney(dossier.montantBrut)}</p>
            </div>
          </div>

          {/* Commission */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
              <Euro className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Net talent ({dossier.commissionPercent}%)</p>
              <p className="font-bold text-purple-600 text-lg">{formatMoney(dossier.montantNet)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline chronologique */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-glowup-licorice mb-4">📋 Historique complet</h2>

        {/* 1. Négociation */}
        {dossier.negociation && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-gray-900">1. Négociation</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getStatutColor(dossier.negociation.statut)}`}>
                    {dossier.negociation.statut}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <p>Référence: <span className="font-mono font-semibold">{dossier.negociation.reference}</span></p>
                  {dossier.negociation.budgetFinal && (
                    <p>Budget final: <span className="font-semibold text-green-600">{formatMoney(dossier.negociation.budgetFinal)}</span></p>
                  )}
                  {dossier.negociation.dateValidation && (
                    <p>Validée le: <span className="font-semibold">{formatDate(dossier.negociation.dateValidation)}</span></p>
                  )}
                </div>
                <Link
                  href={`/negociations/${dossier.negociation.id}`}
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Voir la négociation
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 2. Devis */}
        {dossier.devis && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-gray-900">2. Devis</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getStatutColor(dossier.devis.statut)}`}>
                    {dossier.devis.statut}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <p>Référence: <span className="font-mono font-semibold">{dossier.devis.reference}</span></p>
                  <p>Montant HT: <span className="font-semibold">{formatMoney(dossier.devis.montantHT)}</span></p>
                  <p>Montant TTC: <span className="font-semibold text-blue-600">{formatMoney(dossier.devis.montantTTC)}</span></p>
                  {dossier.devis.dateEmission && (
                    <p>Émis le: <span className="font-semibold">{formatDate(dossier.devis.dateEmission)}</span></p>
                  )}
                </div>
                <a
                  href={`/api/documents/${dossier.devis.id}/pdf`}
                  target="_blank"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Download className="w-4 h-4" />
                  Télécharger le devis
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 3. Collaboration */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold text-gray-900">3. Collaboration</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getStatutColor(dossier.statut)}`}>
                  {dossier.statut}
                </span>
              </div>
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                {dossier.dateDebut && (
                  <p>Début: <span className="font-semibold">{formatDate(dossier.dateDebut)}</span></p>
                )}
                {dossier.dateFin && (
                  <p>Fin: <span className="font-semibold">{formatDate(dossier.dateFin)}</span></p>
                )}
                {dossier.datePublication && (
                  <p>Publié le: <span className="font-semibold">{formatDate(dossier.datePublication)}</span></p>
                )}
                {dossier.lienPublication && (
                  <p>
                    <a href={dossier.lienPublication} target="_blank" className="text-blue-600 hover:underline">
                      Voir la publication
                    </a>
                  </p>
                )}
              </div>
              <Link
                href={`/collaborations/${dossier.id}`}
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Voir la collaboration
              </Link>
            </div>
          </div>
        </div>

        {/* 4. Facture Client */}
        {dossier.factureClient && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Receipt className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-gray-900">4. Facture Client</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getStatutColor(dossier.factureClient.statut)}`}>
                    {dossier.factureClient.statut}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <p>Référence: <span className="font-mono font-semibold">{dossier.factureClient.reference}</span></p>
                  <p>Montant HT: <span className="font-semibold">{formatMoney(dossier.factureClient.montantHT)}</span></p>
                  <p>Montant TTC: <span className="font-semibold text-emerald-600">{formatMoney(dossier.factureClient.montantTTC)}</span></p>
                  {dossier.factureClient.dateEmission && (
                    <p>Émise le: <span className="font-semibold">{formatDate(dossier.factureClient.dateEmission)}</span></p>
                  )}
                  {dossier.factureClient.dateEcheance && (
                    <p>Échéance: <span className="font-semibold">{formatDate(dossier.factureClient.dateEcheance)}</span></p>
                  )}
                  {dossier.factureClient.datePaiement && (
                    <p>Payée le: <span className="font-semibold text-green-600">{formatDate(dossier.factureClient.datePaiement)}</span></p>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  <a
                    href={`/api/documents/${dossier.factureClient.id}/pdf`}
                    target="_blank"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger la facture
                  </a>
                  
                  {/* Bouton "Marquer comme payé" */}
                  {dossier.factureClient.statut !== "PAYE" && (
                    <button
                      onClick={() => marquerFacturePayee(dossier.factureClient!.id)}
                      disabled={markingAsPaid}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {markingAsPaid ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Marquage...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Marquer comme payé
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Facture Talent */}
        {dossier.factureTalentUrl ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Receipt className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-gray-900">5. Facture Talent</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${dossier.paidAt ? getStatutColor("PAYE") : getStatutColor("EN_ATTENTE")}`}>
                    {dossier.paidAt ? "PAYÉ" : "EN ATTENTE"}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <p>Montant net: <span className="font-semibold text-green-600">{formatMoney(dossier.montantNet)}</span></p>
                  {dossier.factureTalentRecueAt && (
                    <p>Reçue le: <span className="font-semibold">{formatDate(dossier.factureTalentRecueAt)}</span></p>
                  )}
                  {dossier.paidAt && (
                    <p>Payée le: <span className="font-semibold text-green-600">{formatDate(dossier.paidAt)}</span></p>
                  )}
                </div>
                <a
                  href={dossier.factureTalentUrl}
                  target="_blank"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Download className="w-4 h-4" />
                  Télécharger la facture talent
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-500 mb-2">5. Facture Talent</h3>
                <p className="text-sm text-gray-500">En attente de la facture du talent</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
