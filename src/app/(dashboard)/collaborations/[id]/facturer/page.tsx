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
} from "lucide-react";

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
          dateEcheance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          notes: "",
        });

        // Pré-remplir les livrables si disponibles
        if (data.livrables && data.livrables.length > 0) {
          setLignes(
            data.livrables.map((l: any) => ({
              description: l.description || "",
              quantite: l.quantite || 1,
              prixUnitaire: Number(l.prix) || 0,
              tauxTVA: 20,
            }))
          );
        }
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  const addLigne = () => {
    setLignes([
      ...lignes,
      {
        description: "",
        quantite: 1,
        prixUnitaire: 0,
        tauxTVA: 20,
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

  const calculateTotaux = () => {
    let montantHT = 0;
    lignes.forEach((ligne) => {
      montantHT += ligne.quantite * ligne.prixUnitaire;
    });

    const montantTVA = montantHT * 0.2; // 20% par défaut
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

    setGenerating(true);

    try {
      const res = await fetch(`/api/collaborations/${params.id}/generer-facture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: formData.titre,
          dateEcheance: formData.dateEcheance,
          notes: formData.notes,
          lignes: lignes.map((ligne) => ({
            description: ligne.description,
            quantite: ligne.quantite,
            prixUnitaire: ligne.prixUnitaire,
            tauxTVA: ligne.tauxTVA,
            totalHT: ligne.quantite * ligne.prixUnitaire,
          })),
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
                  <span className="text-white/80">TVA 20%</span>
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
