"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Gift, ArrowLeft, Loader2, AlertCircle, User, Building2,
  Package, Calendar, MapPin, DollarSign, AlertTriangle,
} from "lucide-react";

export default function NewGiftPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talents, setTalents] = useState<any[]>([]);
  const [marques, setMarques] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [formData, setFormData] = useState({
    talentId: "",
    marqueId: "",
    typeGift: "PRODUIT",
    description: "",
    justification: "",
    valeurEstimee: "",
    priorite: "NORMALE",
    dateSouhaitee: "",
    adresseLivraison: "",
  });

  const user = session?.user as { role?: string; id?: string };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoadingData(true);
      const [talentsRes, marquesRes] = await Promise.all([
        fetch("/api/talents"),
        fetch("/api/marques"),
      ]);

      if (talentsRes.ok) {
        const talentsData = await talentsRes.json();
        // Filtrer uniquement les talents gérés par ce TM
        setTalents(talentsData);
      }

      if (marquesRes.ok) {
        const marquesData = await marquesRes.json();
        setMarques(marquesData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.talentId || !formData.typeGift || !formData.description) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          statut: "EN_ATTENTE", // Soumise directement
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la création");
      }

      const demande = await res.json();
      router.push(`/gifts/${demande.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erreur lors de la création de la demande");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Auto-remplir l'adresse si un talent est sélectionné
    if (name === "talentId" && value) {
      const talent = talents.find((t) => t.id === value);
      if (talent && talent.adresse) {
        const adresse = `${talent.adresse || ""}\n${talent.codePostal || ""} ${talent.ville || ""}\n${talent.pays || "France"}`.trim();
        setFormData((prev) => ({ ...prev, adresseLivraison: adresse }));
      }
    }
  };

  if (user?.role !== "TM") {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <AlertTriangle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-glowup-licorice mb-2">
          Accès réservé aux Talent Managers
        </h2>
        <p className="text-gray-600 mb-6">
          Seuls les Talent Managers peuvent créer des demandes de gifts.
        </p>
        <Link
          href="/gifts"
          className="inline-flex items-center gap-2 px-6 py-3 bg-glowup-rose text-white rounded-xl font-semibold hover:bg-glowup-rose-dark transition-colors"
        >
          Retour aux demandes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-pink-600 rounded-2xl p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative">
          <Link
            href="/gifts"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux demandes
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
              <Gift className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold">Nouvelle demande de Gift</h1>
              <p className="text-white/80 mt-1">
                Demandez un produit ou service pour l'un de vos talents
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Erreur */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700">Erreur</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Informations principales */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-glowup-licorice mb-6 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" />
            Informations principales
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Talent */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Talent <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  name="talentId"
                  value={formData.talentId}
                  onChange={handleChange}
                  required
                  disabled={loadingData}
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                >
                  <option value="">Sélectionner un talent</option>
                  {talents.map((talent) => (
                    <option key={talent.id} value={talent.id}>
                      {talent.prenom} {talent.nom}
                      {talent.instagram ? ` (@${talent.instagram})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Type de gift */}
            <div>
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Type de Gift <span className="text-red-500">*</span>
              </label>
              <select
                name="typeGift"
                value={formData.typeGift}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              >
                <option value="PRODUIT">Produit</option>
                <option value="EXPERIENCE">Expérience</option>
                <option value="SERVICE">Service</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>

            {/* Priorité */}
            <div>
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Priorité
              </label>
              <select
                name="priorite"
                value={formData.priorite}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              >
                <option value="BASSE">Basse</option>
                <option value="NORMALE">Normale</option>
                <option value="HAUTE">Haute</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>

            {/* Marque (optionnel) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Marque souhaitée (optionnel)
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  name="marqueId"
                  value={formData.marqueId}
                  onChange={handleChange}
                  disabled={loadingData}
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                >
                  <option value="">Aucune marque spécifique</option>
                  {marques.map((marque) => (
                    <option key={marque.id} value={marque.id}>
                      {marque.nom}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Si vous connaissez déjà la marque auprès de laquelle demander le gift
              </p>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Description du gift <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={4}
                placeholder="Décrivez précisément le produit/service demandé..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
              />
            </div>

            {/* Justification */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Justification
              </label>
              <textarea
                name="justification"
                value={formData.justification}
                onChange={handleChange}
                rows={3}
                placeholder="Pourquoi ce gift est important ? Quel est le contexte ?"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
              />
            </div>

            {/* Valeur estimée */}
            <div>
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Valeur estimée (€)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="number"
                  name="valeurEstimee"
                  value={formData.valeurEstimee}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Date souhaitée */}
            <div>
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Date de réception souhaitée
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  name="dateSouhaitee"
                  value={formData.dateSouhaitee}
                  onChange={handleChange}
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Adresse de livraison */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-glowup-licorice mb-2">
                Adresse de livraison
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <textarea
                  name="adresseLivraison"
                  value={formData.adresseLivraison}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Adresse complète de livraison..."
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                L'adresse du talent sera pré-remplie automatiquement
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/gifts"
            className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={loading || loadingData}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Création en cours...
              </>
            ) : (
              <>
                <Gift className="w-5 h-5" />
                Créer la demande
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
