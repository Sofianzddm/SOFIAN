"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Building2,
  Globe,
  Save,
  Loader2,
  Sparkles,
} from "lucide-react";

const SECTEURS = [
  "Beauté",
  "Mode",
  "Food",
  "Tech",
  "Sport",
  "Lifestyle",
  "Luxe",
  "Automobile",
  "Finance",
  "Santé",
  "Voyage",
  "Entertainment",
];

export default function NewMarquePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    nom: "",
    secteur: "",
    siteWeb: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.nom.trim()) {
      alert("Le nom de la marque est obligatoire");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/marques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const marque = await res.json();
        router.push(`/marques/${marque.id}/edit?complete=true`);
      } else {
        const error = await res.json();
        alert(error.message || "Erreur lors de la création");
      }
    } catch (error) {
      alert("Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/marques"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-glowup-licorice">
                  Nouvelle marque
                </h1>
                <p className="text-sm text-gray-500">
                  Création rapide - Les détails seront complétés plus tard
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form - Version simplifiée */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-glowup-rose/10 rounded-lg">
                  <Building2 className="w-5 h-5 text-glowup-rose" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-glowup-licorice">
                    Informations de base
                  </h2>
                  <p className="text-xs text-gray-500">
                    Juste le minimum pour démarrer
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Nom marque */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nom de la marque *
                  </label>
                  <input
                    type="text"
                    name="nom"
                    value={formData.nom}
                    onChange={handleChange}
                    placeholder="L'Oréal, Nike, Apple..."
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all text-lg font-medium"
                    autoFocus
                  />
                </div>

                {/* Secteur */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Secteur d'activité
                  </label>
                  <select
                    name="secteur"
                    value={formData.secteur}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                  >
                    <option value="">Sélectionner un secteur</option>
                    {SECTEURS.map((secteur) => (
                      <option key={secteur} value={secteur}>
                        {secteur}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Site web */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <Globe className="w-4 h-4 inline mr-1 text-gray-400" />
                    Site web (optionnel)
                  </label>
                  <input
                    type="url"
                    name="siteWeb"
                    value={formData.siteWeb}
                    onChange={handleChange}
                    placeholder="https://www.example.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Notes internes (optionnel)
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Informations complémentaires..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Bouton submit */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !formData.nom.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark transition-all shadow-lg shadow-glowup-rose/25 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Création en cours...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Créer la marque
                    </>
                  )}
                </button>
                <p className="text-xs text-center text-gray-500 mt-3">
                  Vous pourrez compléter les informations légales (SIRET, TVA, contacts) juste après
                </p>
              </div>
            </div>

            {/* Info box */}
            <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">
                    ✨ Auto-complétion intelligente
                  </h3>
                  <p className="text-sm text-blue-700 leading-relaxed">
                    Après la création, vous pourrez <strong>rechercher automatiquement</strong> les informations légales de l'entreprise (SIRET, TVA, adresse) via l'API Pappers.
                  </p>
                  <p className="text-xs text-blue-600 mt-2">
                    Plus besoin de tout remplir à la main !
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Card */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Cover */}
                <div className="h-16 bg-gradient-to-br from-glowup-rose to-glowup-licorice" />

                {/* Avatar */}
                <div className="px-6 -mt-8">
                  <div className="w-16 h-16 rounded-xl bg-white border-4 border-white flex items-center justify-center shadow-lg">
                    <span className="text-xl font-bold text-glowup-rose">
                      {formData.nom?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-6 pt-3">
                  <h3 className="text-lg font-bold text-glowup-licorice">
                    {formData.nom || "Nom de la marque"}
                  </h3>
                  {formData.secteur && (
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {formData.secteur}
                    </span>
                  )}

                  {formData.siteWeb && (
                    <p className="text-sm text-gray-500 mt-3 flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      {formData.siteWeb.replace(/^https?:\/\//, "")}
                    </p>
                  )}

                  {formData.notes && (
                    <p className="text-xs text-gray-500 mt-3 line-clamp-3">
                      {formData.notes}
                    </p>
                  )}
                </div>

                <div className="px-6 pb-6">
                  <div className="bg-glowup-lace/50 rounded-xl p-4">
                    <p className="text-xs text-gray-600 flex items-center gap-2">
                      <Check className="w-4 h-4 text-glowup-rose" />
                      <span>
                        <strong>Prochaine étape :</strong> Compléter les infos légales avec l'API Pappers
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
