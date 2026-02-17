"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  Building2,
  Package,
  Euro,
  Plus,
  Trash2,
  AlertCircle,
  Calendar,
  Mail,
  FileText,
} from "lucide-react";

const SOURCES = ["INBOUND", "OUTBOUND"];
const TYPES_CONTENU = [
  { value: "STORY", label: "Story" },
  { value: "STORY_CONCOURS", label: "Story Concours" },
  { value: "POST", label: "Post" },
  { value: "POST_CONCOURS", label: "Post Concours" },
  { value: "POST_COMMUN", label: "Post Commun" },
  { value: "REEL", label: "Reel" },
  { value: "TIKTOK_VIDEO", label: "Vidéo TikTok" },
  { value: "YOUTUBE_VIDEO", label: "Vidéo YouTube" },
  { value: "YOUTUBE_SHORT", label: "YouTube Short" },
  { value: "EVENT", label: "Event" },
  { value: "SHOOTING", label: "Shooting" },
  { value: "AMBASSADEUR", label: "Ambassadeur" },
];

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  commissionInbound: number;
  commissionOutbound: number;
  tarifs?: any;
}

interface Marque {
  id: string;
  nom: string;
  secteur: string | null;
}

interface Livrable {
  id: string;
  typeContenu: string;
  quantite: number;
  prixDemande: number | null;
  prixSouhaite: number | null;
  prixFinal: number | null;
  description: string;
}

export default function EditNegociationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [marques, setMarques] = useState<Marque[]>([]);
  const [negoStatut, setNegoStatut] = useState<string>("");

  const [formData, setFormData] = useState({
    talentId: "",
    marqueId: "",
    source: "INBOUND",
    contactMarque: "",
    emailContact: "",
    brief: "",
    budgetMarque: "",
    budgetSouhaite: "",
    budgetFinal: "",
    dateDeadline: "",
    livrables: [] as Livrable[],
  });

  useEffect(() => {
    fetchNegociation();
    fetchTalents();
    fetchMarques();
  }, [params.id]);

  const fetchNegociation = async () => {
    try {
      const res = await fetch(`/api/negociations/${params.id}`);
      if (res.ok) {
        const nego = await res.json();
        setNegoStatut(nego.statut); // 🔍 Capturer le statut
        setFormData({
          talentId: nego.talentId,
          marqueId: nego.marqueId,
          source: nego.source,
          contactMarque: nego.contactMarque || "",
          emailContact: nego.emailContact || "",
          brief: nego.brief || "",
          budgetMarque: nego.budgetMarque || "",
          budgetSouhaite: nego.budgetSouhaite || "",
          budgetFinal: nego.budgetFinal || "",
          dateDeadline: nego.dateDeadline ? nego.dateDeadline.split("T")[0] : "",
          livrables: nego.livrables.map((l: any) => ({
            id: l.id,
            typeContenu: l.typeContenu,
            quantite: l.quantite,
            prixDemande: l.prixDemande || "",
            prixSouhaite: l.prixSouhaite || "",
            prixFinal: l.prixFinal || "",
            description: l.description || "",
          })),
        });
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTalents = async () => {
    const res = await fetch("/api/talents");
    if (res.ok) setTalents(await res.json());
  };

  const fetchMarques = async () => {
    const res = await fetch("/api/marques");
    if (res.ok) setMarques(await res.json());
  };

  const addLivrable = () => {
    setFormData({
      ...formData,
      livrables: [
        ...formData.livrables,
        {
          id: `new-${Date.now()}`,
          typeContenu: "",
          quantite: 1,
          prixDemande: null,
          prixSouhaite: null,
          prixFinal: null,
          description: "",
        },
      ],
    });
  };

  const updateLivrable = (id: string, field: keyof Livrable, value: any) => {
    setFormData({
      ...formData,
      livrables: formData.livrables.map((l) =>
        l.id === id
          ? {
              ...l,
              [field]:
                field === "typeContenu" || field === "description"
                  ? value
                  : value === ""
                  ? null
                  : Number(value),
            }
          : l
      ),
    });
  };

  const removeLivrable = (id: string) => {
    setFormData({
      ...formData,
      livrables: formData.livrables.filter((l) => l.id !== id),
    });
  };

  const getTarifRecommande = (typeContenu: string): number | null => {
    const selectedTalent = talents.find((t) => t.id === formData.talentId);
    if (!selectedTalent?.tarifs) return null;

    const normalized = typeContenu
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "");

    for (const type of TYPES_CONTENU) {
      const typeNormalized = type.label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");

      if (normalized.includes(typeNormalized) || typeNormalized.includes(normalized)) {
        const tarifKey = `tarif${type.value.charAt(0) + type.value.slice(1).toLowerCase().replace(/_./g, (m) => m[1].toUpperCase())}`;
        const tarif = selectedTalent.tarifs[tarifKey];
        if (tarif) return Number(tarif);
      }
    }

    return null;
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.livrables.length === 0) {
      alert("Veuillez ajouter au moins un livrable");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/negociations/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentId: formData.talentId,
          marqueId: formData.marqueId,
          source: formData.source,
          contactMarque: formData.contactMarque,
          emailContact: formData.emailContact,
          brief: formData.brief,
          budgetMarque: formData.budgetMarque || null,
          budgetSouhaite: formData.budgetSouhaite || null,
          budgetFinal: formData.budgetFinal || null,
          dateDeadline: formData.dateDeadline || null,
          livrables: formData.livrables.map((l) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite,
            prixDemande: l.prixDemande,
            prixSouhaite: l.prixSouhaite,
            prixFinal: l.prixFinal,
            description: l.description,
          })),
        }),
      });

      if (res.ok) {
        router.push(`/negociations/${params.id}`);
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de la mise à jour");
      }
    } catch (error) {
      alert("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/negociations/${params.id}`}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-glowup-licorice">Modifier la négociation</h1>
            <p className="text-gray-500 text-sm">Mise à jour des informations</p>
          </div>
        </div>
      </div>

      {/* Avertissement REFUSEE */}
      {negoStatut === "REFUSEE" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900 text-sm">🔄 Réouverture de négociation refusée</p>
            <p className="text-xs text-amber-700 mt-1">
              Cette négociation a été refusée. En enregistrant vos modifications, elle sera <strong>automatiquement remise en brouillon</strong> et vous pourrez la re-soumettre.
            </p>
          </div>
        </div>
      )}

      {/* Avertissement */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-blue-900 text-sm">💡 Bon à savoir</p>
          <p className="text-xs text-blue-700 mt-1">
            Les modifications seront notifiées aux responsables si la négociation est déjà soumise.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Talent & Marque */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-glowup-rose/10 rounded-lg">
              <User className="w-5 h-5 text-glowup-rose" />
            </div>
            <h2 className="text-lg font-semibold text-glowup-licorice">Talent & Marque</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelClass}>Talent *</label>
              <select
                name="talentId"
                value={formData.talentId}
                onChange={(e) => setFormData({ ...formData, talentId: e.target.value })}
                required
                className={inputClass}
              >
                <option value="">Sélectionner...</option>
                {talents.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.prenom} {t.nom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Marque *</label>
              <select
                name="marqueId"
                value={formData.marqueId}
                onChange={(e) => setFormData({ ...formData, marqueId: e.target.value })}
                required
                className={inputClass}
              >
                <option value="">Sélectionner...</option>
                {marques.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Source *</label>
              <select
                name="source"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
                required
                className={inputClass}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Contact marque</label>
              <input
                type="text"
                name="contactMarque"
                value={formData.contactMarque}
                onChange={(e) => setFormData({ ...formData, contactMarque: e.target.value })}
                placeholder="Prénom Nom"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Email contact</label>
              <input
                type="email"
                name="emailContact"
                value={formData.emailContact}
                onChange={(e) => setFormData({ ...formData, emailContact: e.target.value })}
                placeholder="contact@marque.com"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Brief & Budgets */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-glowup-licorice">Brief & Budget</h2>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Brief</label>
            <textarea
              name="brief"
              value={formData.brief}
              onChange={(e) => setFormData({ ...formData, brief: e.target.value })}
              rows={4}
              className={inputClass}
              placeholder="Détails de la demande..."
            />
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Budget marque €</label>
              <input
                type="number"
                name="budgetMarque"
                value={formData.budgetMarque}
                onChange={(e) => setFormData({ ...formData, budgetMarque: e.target.value })}
                placeholder="Ex: 5000"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Budget souhaité €</label>
              <input
                type="number"
                name="budgetSouhaite"
                value={formData.budgetSouhaite}
                onChange={(e) => setFormData({ ...formData, budgetSouhaite: e.target.value })}
                placeholder="Ex: 7000"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Budget final €</label>
              <input
                type="number"
                name="budgetFinal"
                value={formData.budgetFinal}
                onChange={(e) => setFormData({ ...formData, budgetFinal: e.target.value })}
                placeholder="Ex: 6500"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Deadline</label>
              <input
                type="date"
                name="dateDeadline"
                value={formData.dateDeadline}
                onChange={(e) => setFormData({ ...formData, dateDeadline: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Livrables */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Package className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-glowup-licorice">Livrables demandés</h2>
            </div>
            <button
              type="button"
              onClick={addLivrable}
              className="flex items-center gap-2 px-4 py-2 bg-glowup-licorice text-white rounded-xl hover:bg-glowup-licorice/90 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </div>

          {formData.livrables.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun livrable. Cliquez sur "Ajouter" pour commencer.</p>
            </div>
          ) : (
            <div className="space-y-4 pb-6">
              {formData.livrables.map((livrable, index) => (
                <div key={livrable.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-4">
                    <span className="w-8 h-8 bg-glowup-lace rounded-full flex items-center justify-center text-sm font-bold text-glowup-licorice flex-shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 space-y-4">
                      <div className="grid md:grid-cols-12 gap-3">
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-500 mb-1">Type *</label>
                          <input
                            type="text"
                            list={`types-contenu-${livrable.id}`}
                            value={livrable.typeContenu}
                            onChange={(e) => updateLivrable(livrable.id, "typeContenu", e.target.value)}
                            placeholder="Choisir ou écrire..."
                            required
                            className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose/20"
                          />
                          <datalist id={`types-contenu-${livrable.id}`}>
                            {TYPES_CONTENU.map((type) => (
                              <option key={type.value} value={type.label} />
                            ))}
                          </datalist>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Qté *</label>
                          <input
                            type="number"
                            min="1"
                            value={livrable.quantite}
                            onChange={(e) => updateLivrable(livrable.id, "quantite", e.target.value)}
                            required
                            className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Prix demandé €</label>
                          <input
                            type="number"
                            min="0"
                            value={livrable.prixDemande || ""}
                            onChange={(e) => updateLivrable(livrable.id, "prixDemande", e.target.value)}
                            placeholder="Demande"
                            className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-red-50"
                          />
                        </div>
                        <div className="col-span-3 relative">
                          <label className="block text-xs text-gray-500 mb-1">Prix souhaité €</label>
                          <input
                            type="number"
                            min="0"
                            value={livrable.prixSouhaite || ""}
                            onChange={(e) => updateLivrable(livrable.id, "prixSouhaite", e.target.value)}
                            placeholder="Voulu"
                            className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-green-50"
                          />
                          {(() => {
                            const tarifRecommande = getTarifRecommande(livrable.typeContenu);
                            if (tarifRecommande && livrable.typeContenu) {
                              const prixSouhaite = parseFloat(String(livrable.prixSouhaite)) || 0;
                              const difference = prixSouhaite - tarifRecommande;
                              const pourcentage =
                                tarifRecommande > 0
                                  ? ((difference / tarifRecommande) * 100).toFixed(0)
                                  : 0;

                              return (
                                <div className="absolute -bottom-6 left-0 right-0 flex items-center justify-between text-[10px] mt-1">
                                  <span className="text-gray-600 font-medium">
                                    Grille: {formatMoney(tarifRecommande)}
                                  </span>
                                  {prixSouhaite > 0 && prixSouhaite !== tarifRecommande && (
                                    <span
                                      className={`font-bold ${
                                        difference > 0 ? "text-green-600" : "text-red-600"
                                      }`}
                                    >
                                      {difference > 0 ? "+" : ""}
                                      {pourcentage}%
                                    </span>
                                  )}
                                  {(!livrable.prixSouhaite || prixSouhaite === 0) && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateLivrable(
                                          livrable.id,
                                          "prixSouhaite",
                                          tarifRecommande.toString()
                                        )
                                      }
                                      className="text-blue-600 hover:text-blue-700 hover:underline font-bold transition-all"
                                    >
                                      → Appliquer
                                    </button>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Prix final €</label>
                          <input
                            type="number"
                            min="0"
                            value={livrable.prixFinal || ""}
                            onChange={(e) => updateLivrable(livrable.id, "prixFinal", e.target.value)}
                            placeholder="Final"
                            className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-blue-50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Description</label>
                        <textarea
                          value={livrable.description}
                          onChange={(e) => updateLivrable(livrable.id, "description", e.target.value)}
                          rows={2}
                          placeholder="Détails du livrable..."
                          className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose resize-none"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLivrable(livrable.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <Link
            href={`/negociations/${params.id}`}
            className="px-6 py-2.5 text-gray-600 hover:text-glowup-licorice transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
