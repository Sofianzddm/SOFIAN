"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Euro,
  Calendar,
  Save,
  Building2,
} from "lucide-react";
import { LISTE_PAYS } from "@/lib/pays";
import { getTypeTVA, MENTIONS_TVA } from "@/lib/documents/config";

interface LignePrestation {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
}

export default function FacturerPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [collaboration, setCollaboration] = useState<any>(null);

  const [formData, setFormData] = useState({
    titre: "",
    dateEcheance: "",
    notes: "",
  });

  const [billingData, setBillingData] = useState({
    raisonSociale: "",
    adresseRue: "",
    codePostal: "",
    ville: "",
    pays: "France",
    siret: "",
    numeroTVA: "",
  });

  const [lignes, setLignes] = useState<LignePrestation[]>([
    {
      description: "",
      quantite: 1,
      prixUnitaire: 0,
      tauxTVA: 20,
    },
  ]);

  useEffect(() => {
    fetchCollaboration();
  }, []);

  async function fetchCollaboration() {
    try {
      const res = await fetch(`/api/collaborations/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setCollaboration(data);
        
        // Pré-remplir avec les données de la collaboration
        setFormData({
          titre: data.titre || `Campagne ${data.marque?.nom}`,
          dateEcheance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          notes: "",
        });
        setBillingData({
          raisonSociale: data.marque?.raisonSociale || data.marque?.nom || "",
          adresseRue: data.marque?.adresseRue || "",
          codePostal: data.marque?.codePostal || "",
          ville: data.marque?.ville || "",
          pays: data.marque?.pays || "France",
          siret: data.marque?.siret || "",
          numeroTVA: data.marque?.numeroTVA || "",
        });

        // 1) Si un devis existe pour cette collab, on reprend ses infos (lignes, TVA, échéance, notes)
        const devisSummary =
          (data.documents || []).find((d: any) => d.type === "DEVIS" && d.statut === "VALIDE") ||
          (data.documents || []).find((d: any) => d.type === "DEVIS");

        if (devisSummary) {
          try {
            const devisRes = await fetch(`/api/documents/${devisSummary.id}`);
            if (devisRes.ok) {
              const devis = await devisRes.json();

              // Titre / échéance / notes depuis le devis
              setFormData(prev => ({
                ...prev,
                titre: devis.titre || prev.titre,
                dateEcheance: devis.dateEcheance
                  ? new Date(devis.dateEcheance).toISOString().split("T")[0]
                  : prev.dateEcheance,
                notes: devis.notes || prev.notes,
              }));

              // Lignes : copier celles du devis
              if (devis.lignes && Array.isArray(devis.lignes) && devis.lignes.length > 0) {
                setLignes(
                  devis.lignes.map((l: any) => {
                    const q = Number(l.quantite) || 1;
                    const pu =
                      l.prixUnitaire != null
                        ? Number(l.prixUnitaire)
                        : l.totalHT != null
                        ? Number(l.totalHT) / q
                        : 0;
                    const taux = l.tauxTVA != null ? Number(l.tauxTVA) : devis.tauxTVA != null ? Number(devis.tauxTVA) : 20;
                    return {
                      description: l.description || "",
                      quantite: q,
                      prixUnitaire: pu,
                      tauxTVA: taux,
                    } as LignePrestation;
                  })
                );
              }
            }
          } catch (e) {
            console.error("Erreur lors du chargement du devis pour la facturation:", e);
          }
        } else {
          // 2) Sinon, fallback : pré-remplir avec les livrables de la collaboration
          if (data.livrables && data.livrables.length > 0) {
            setLignes(
              data.livrables.map((l: any) => ({
                description: l.description || "",
                quantite: l.quantite || 1,
                prixUnitaire: Number(l.prix) || Number(l.prixUnitaire) || 0,
                tauxTVA: 20,
              }))
            );
          }
        }
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  const addLigne = () => {
    const regime = MENTIONS_TVA[getTypeTVA(billingData.pays, billingData.numeroTVA?.trim() || null)];
    setLignes([
      ...lignes,
      {
        description: "",
        quantite: 1,
        prixUnitaire: 0,
        tauxTVA: regime.tauxTVA,
      },
    ]);
  };

  const removeLigne = (index: number) => {
    setLignes(lignes.filter((_, i) => i !== index));
  };

  const updateLigne = (index: number, field: keyof LignePrestation, value: any) => {
    const newLignes = [...lignes];
    newLignes[index] = {
      ...newLignes[index],
      [field]: value,
    };
    setLignes(newLignes);
  };

  // TVA selon pays + n° TVA intracom (France 20%, UE avec n° TVA 0%, etc.)
  const tvaRegime = MENTIONS_TVA[getTypeTVA(billingData.pays, billingData.numeroTVA?.trim() || null)];

  const calculateTotaux = () => {
    let montantHT = 0;
    lignes.forEach((ligne) => {
      montantHT += ligne.quantite * ligne.prixUnitaire;
    });

    const taux = tvaRegime.tauxTVA / 100;
    const montantTVA = montantHT * taux;
    const montantTTC = montantHT + montantTVA;

    return { montantHT, montantTVA, montantTTC };
  };

  const handleGenererFacture = async () => {
    // Validation
    if (!formData.titre.trim()) {
      alert("❌ Le titre de la campagne est requis");
      return;
    }

    if (lignes.length === 0 || !lignes[0].description.trim()) {
      alert("❌ Ajoutez au moins une prestation");
      return;
    }
    if (!billingData.raisonSociale.trim() || !billingData.adresseRue.trim() || !billingData.codePostal.trim() || !billingData.ville.trim() || !billingData.pays.trim()) {
      alert("❌ Complétez les informations de facturation (raison sociale, adresse, code postal, ville, pays).");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch(`/api/collaborations/${params.id}/generer-facture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: formData.titre,
          dateEcheance: formData.dateEcheance,
          notes: formData.notes,
          billing: {
            raisonSociale: billingData.raisonSociale.trim(),
            adresseRue: billingData.adresseRue.trim(),
            codePostal: billingData.codePostal.trim(),
            ville: billingData.ville.trim(),
            pays: billingData.pays.trim(),
            siret: billingData.siret.trim() || null,
            numeroTVA: billingData.numeroTVA.trim() || null,
          },
          lignes: lignes.map((ligne) => ({
            description: ligne.description,
            quantite: ligne.quantite,
            prixUnitaire: ligne.prixUnitaire,
            tauxTVA: tvaRegime.tauxTVA,
            totalHT: ligne.quantite * ligne.prixUnitaire,
          })),
          typeTVA: getTypeTVA(billingData.pays.trim(), billingData.numeroTVA.trim() || null),
          mentionTVA: tvaRegime.mention ?? undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        alert("✅ Facture générée avec succès !");
        router.push(`/collaborations/${params.id}`);
      } else {
        const error = await res.json();
        alert(`❌ Erreur : ${error.error || "Impossible de générer la facture"}`);
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur lors de la génération de la facture");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (!collaboration) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600">Collaboration introuvable</p>
      </div>
    );
  }

  const totaux = calculateTotaux();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/collaborations/${params.id}`}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-glowup-licorice flex items-center gap-3">
            <FileText className="w-8 h-8" />
            Générer la facture
          </h1>
          <p className="text-gray-600 mt-1">
            {collaboration.reference} - {collaboration.talent?.prenom} {collaboration.talent?.nom}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Informations de facturation */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-glowup-licorice mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Informations de facturation *
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Client à facturer (marque ou prestataire). Ces informations apparaîtront sur la facture.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Raison sociale / Nom *</label>
                <input
                  type="text"
                  value={billingData.raisonSociale}
                  onChange={(e) => setBillingData((p) => ({ ...p, raisonSociale: e.target.value }))}
                  placeholder="Ex : Société ou Nom du prestataire"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label>
                <input
                  type="text"
                  value={billingData.adresseRue}
                  onChange={(e) => setBillingData((p) => ({ ...p, adresseRue: e.target.value }))}
                  placeholder="Numéro et nom de rue"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code postal *</label>
                <input
                  type="text"
                  value={billingData.codePostal}
                  onChange={(e) => setBillingData((p) => ({ ...p, codePostal: e.target.value }))}
                  placeholder="Ex : 75001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ville *</label>
                <input
                  type="text"
                  value={billingData.ville}
                  onChange={(e) => setBillingData((p) => ({ ...p, ville: e.target.value }))}
                  placeholder="Ex : Paris"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pays *</label>
                <select
                  value={billingData.pays}
                  onChange={(e) => setBillingData((p) => ({ ...p, pays: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent bg-white"
                >
                  {LISTE_PAYS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SIRET</label>
                <input
                  type="text"
                  value={billingData.siret}
                  onChange={(e) => setBillingData((p) => ({ ...p, siret: e.target.value }))}
                  placeholder="Optionnel"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° TVA intracom.</label>
                <input
                  type="text"
                  value={billingData.numeroTVA}
                  onChange={(e) => setBillingData((p) => ({ ...p, numeroTVA: e.target.value }))}
                  placeholder="Optionnel"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Informations générales */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-glowup-licorice mb-4">
              Informations générales
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Titre de la campagne *
                </label>
                <input
                  type="text"
                  value={formData.titre}
                  onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                  placeholder="Ex: Campagne Instagram Stories x3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date d'échéance (paiement)
                </label>
                <input
                  type="date"
                  value={formData.dateEcheance}
                  onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Prestations */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-glowup-licorice">Prestations *</h2>
              <button
                onClick={addLigne}
                className="flex items-center gap-2 px-3 py-1.5 bg-glowup-rose text-white rounded-lg hover:bg-glowup-rose-dark transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </div>

            <div className="space-y-3">
              {lignes.map((ligne, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-3 items-start p-4 bg-gray-50 rounded-lg"
                >
                  {/* Description */}
                  <div className="col-span-12 md:col-span-5">
                    <input
                      type="text"
                      value={ligne.description}
                      onChange={(e) => updateLigne(index, "description", e.target.value)}
                      placeholder="Description de la prestation"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose"
                    />
                  </div>

                  {/* Quantité */}
                  <div className="col-span-4 md:col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ligne.quantite}
                      onChange={(e) => updateLigne(index, "quantite", parseFloat(e.target.value) || 0)}
                      placeholder="Qté"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose"
                    />
                  </div>

                  {/* Prix unitaire */}
                  <div className="col-span-4 md:col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ligne.prixUnitaire}
                      onChange={(e) => updateLigne(index, "prixUnitaire", parseFloat(e.target.value) || 0)}
                      placeholder="PU HT"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose"
                    />
                  </div>

                  {/* Total + Actions */}
                  <div className="col-span-4 md:col-span-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {(ligne.quantite * ligne.prixUnitaire).toFixed(2)} €
                    </span>
                    {lignes.length > 1 && (
                      <button
                        onClick={() => removeLigne(index)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-glowup-licorice mb-4">Notes additionnelles</h2>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              placeholder="Ajoutez des notes ou commentaires (optionnel)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Récapitulatif */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-6">
            {/* Totaux */}
            <div className="bg-gradient-to-br from-glowup-rose to-purple-600 rounded-xl p-6 text-white">
              <h3 className="text-lg font-bold mb-4">Récapitulatif</h3>

              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-white/20">
                  <span className="text-white/80">Total HT</span>
                  <span className="text-xl font-bold">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    }).format(totaux.montantHT)}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-3 border-b border-white/20">
                  <span className="text-white/80">TVA {tvaRegime.tauxTVA}%{tvaRegime.mention ? " (intracom.)" : ""}</span>
                  <span className="text-lg font-semibold">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    }).format(totaux.montantTVA)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-3">
                  <span className="text-lg font-bold">Total TTC</span>
                  <span className="text-2xl font-bold">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    }).format(totaux.montantTTC)}
                  </span>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                <strong>ℹ️ Info :</strong> La facture sera générée au nom du talent (
                {collaboration.talent?.prenom} {collaboration.talent?.nom}).
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={handleGenererFacture}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-glowup-rose to-purple-600 text-white px-6 py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 font-semibold"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Générer la facture
                  </>
                )}
              </button>

              <Link
                href={`/collaborations/${params.id}`}
                className="block w-full text-center px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
