"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  Building2,
  Euro,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  ChevronDown,
  Trash2,
  Package,
  FileText,
  Calendar,
  Mail,
} from "lucide-react";
import QuickMarqueModal from "@/components/QuickMarqueModal";

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  tarifs: Record<string, number | null> | null;
}

interface Marque {
  id: string;
  nom: string;
  contacts?: { nom: string; email: string | null }[];
}

interface Livrable {
  id: string;
  typeContenu: string;
  quantite: number;
  prixDemande: string;
  prixSouhaite: string;
  description: string;
}

const TYPES_CONTENU = [
  { value: "STORY", label: "Story", tarifKey: "tarifStory" },
  { value: "STORY_CONCOURS", label: "Story Concours", tarifKey: "tarifStoryConcours" },
  { value: "POST", label: "Post", tarifKey: "tarifPost" },
  { value: "POST_CONCOURS", label: "Post Concours", tarifKey: "tarifPostConcours" },
  { value: "POST_COMMUN", label: "Post Commun", tarifKey: "tarifPostCommun" },
  { value: "REEL", label: "Reel", tarifKey: "tarifReel" },
  { value: "TIKTOK_VIDEO", label: "Vidéo TikTok", tarifKey: "tarifTiktokVideo" },
  { value: "YOUTUBE_VIDEO", label: "Vidéo YouTube", tarifKey: "tarifYoutubeVideo" },
  { value: "YOUTUBE_SHORT", label: "YouTube Short", tarifKey: "tarifYoutubeShort" },
  { value: "EVENT", label: "Event", tarifKey: "tarifEvent" },
  { value: "SHOOTING", label: "Shooting", tarifKey: "tarifShooting" },
  { value: "AMBASSADEUR", label: "Ambassadeur", tarifKey: "tarifAmbassadeur" },
];

export default function NewNegociationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [marques, setMarques] = useState<Marque[]>([]);
  const [selectedTalent, setSelectedTalent] = useState<Talent | null>(null);
  const [selectedMarque, setSelectedMarque] = useState<Marque | null>(null);
  const [showMarqueModal, setShowMarqueModal] = useState(false);

  const [formData, setFormData] = useState({
    talentId: searchParams.get("talent") || "",
    marqueId: searchParams.get("marque") || "",
    contactMarque: "",
    emailContact: "",
    source: "INBOUND",
    brief: "",
    budgetMarque: "",
    budgetSouhaite: "",
    dateDeadline: "",
  });

  const [livrables, setLivrables] = useState<Livrable[]>([
    { id: "1", typeContenu: "", quantite: 1, prixDemande: "", prixSouhaite: "", description: "" },
  ]);

  // Calcul des totaux
  const totalDemande = livrables.reduce((acc, l) => acc + (parseFloat(l.prixDemande) || 0) * l.quantite, 0);
  const totalSouhaite = livrables.reduce((acc, l) => acc + (parseFloat(l.prixSouhaite) || 0) * l.quantite, 0);

  useEffect(() => {
    fetchTalents();
    fetchMarques();
  }, []);

  const fetchTalents = async () => {
    const res = await fetch("/api/talents");
    const data = await res.json();
    setTalents(data);
    const preselectedId = searchParams.get("talent");
    if (preselectedId) {
      const talent = data.find((t: Talent) => t.id === preselectedId);
      if (talent) setSelectedTalent(talent);
    }
  };

  const fetchMarques = async () => {
    const res = await fetch("/api/marques");
    setMarques(await res.json());
  };

  const handleTalentChange = (talentId: string) => {
    setFormData((prev) => ({ ...prev, talentId }));
    const talent = talents.find((t) => t.id === talentId);
    setSelectedTalent(talent || null);
  };

  const handleMarqueChange = async (marqueId: string) => {
    setFormData((prev) => ({ ...prev, marqueId, contactMarque: "", emailContact: "" }));
    if (marqueId) {
      const res = await fetch(`/api/marques/${marqueId}`);
      if (res.ok) {
        const marque = await res.json();
        setSelectedMarque(marque);
        // Auto-remplir le contact principal
        const principal = marque.contacts?.find((c: any) => c.principal);
        if (principal) {
          setFormData((prev) => ({ ...prev, contactMarque: principal.nom, emailContact: principal.email || "" }));
        }
      }
    } else {
      setSelectedMarque(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMarqueCreated = (marque: { id: string; nom: string }) => {
    setMarques((prev) => [...prev, marque]);
    setFormData((prev) => ({ ...prev, marqueId: marque.id }));
  };

  // Gestion des livrables
  const addLivrable = () => {
    setLivrables((prev) => [
      ...prev,
      { id: Date.now().toString(), typeContenu: "", quantite: 1, prixDemande: "", prixSouhaite: "", description: "" },
    ]);
  };

  const removeLivrable = (id: string) => {
    if (livrables.length === 1) return;
    setLivrables((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLivrable = (id: string, field: keyof Livrable, value: string | number) => {
    setLivrables((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        // Auto-fill prix souhaité si on change le type et qu'on a les tarifs
        if (field === "typeContenu" && selectedTalent?.tarifs) {
          const typeInfo = TYPES_CONTENU.find((t) => t.value === value);
          if (typeInfo && selectedTalent.tarifs[typeInfo.tarifKey]) {
            updated.prixSouhaite = selectedTalent.tarifs[typeInfo.tarifKey]!.toString();
          }
        }
        return updated;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLivrables = livrables.filter((l) => l.typeContenu);
    if (validLivrables.length === 0) {
      alert("Ajoutez au moins un livrable");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/negociations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          budgetMarque: totalDemande || null,
          budgetSouhaite: totalSouhaite || null,
          livrables: validLivrables,
        }),
      });

      if (res.ok) {
        const nego = await res.json();
        router.push(`/negociations/${nego.id}`);
      } else {
        const error = await res.json();
        alert(error.message || "Erreur");
      }
    } catch (error) {
      alert("Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);

  return (
    <>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/negociations" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-glowup-licorice">Nouvelle négociation</h1>
            <p className="text-sm text-gray-500">Déclarer une nouvelle opportunité</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Partenaires */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Partenaires</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Talent *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    name="talentId"
                    value={formData.talentId}
                    onChange={(e) => handleTalentChange(e.target.value)}
                    required
                    className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice appearance-none bg-white text-sm"
                  >
                    <option value="">Sélectionner</option>
                    {talents.map((t) => (
                      <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Marque *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      name="marqueId"
                      value={formData.marqueId}
                      onChange={(e) => handleMarqueChange(e.target.value)}
                      required
                      className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice appearance-none bg-white text-sm"
                    >
                      <option value="">Sélectionner</option>
                      {marques.map((m) => (
                        <option key={m.id} value={m.id}>{m.nom}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMarqueModal(true)}
                    className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact marque</label>
                <input
                  type="text"
                  name="contactMarque"
                  value={formData.contactMarque}
                  onChange={handleChange}
                  placeholder="Nom du contact"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email contact</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    name="emailContact"
                    value={formData.emailContact}
                    onChange={handleChange}
                    placeholder="email@marque.com"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Source</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, source: "INBOUND" }))}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  formData.source === "INBOUND" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ArrowDownLeft className={`w-5 h-5 ${formData.source === "INBOUND" ? "text-blue-600" : "text-gray-400"}`} />
                  <div>
                    <p className={`font-medium ${formData.source === "INBOUND" ? "text-blue-700" : "text-gray-700"}`}>Inbound</p>
                    <p className="text-xs text-gray-500">La marque nous contacte</p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, source: "OUTBOUND" }))}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  formData.source === "OUTBOUND" ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ArrowUpRight className={`w-5 h-5 ${formData.source === "OUTBOUND" ? "text-green-600" : "text-gray-400"}`} />
                  <div>
                    <p className={`font-medium ${formData.source === "OUTBOUND" ? "text-green-700" : "text-gray-700"}`}>Outbound</p>
                    <p className="text-xs text-gray-500">On démarche la marque</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Livrables */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4" /> Livrables demandés
              </h2>
              <button type="button" onClick={addLivrable} className="flex items-center gap-1 text-sm text-glowup-licorice hover:text-glowup-rose">
                <Plus className="w-4 h-4" /> Ajouter
              </button>
            </div>

            <div className="space-y-3">
              {livrables.map((livrable) => (
                <div key={livrable.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-12 gap-3">
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Type *</label>
                      <select
                        value={livrable.typeContenu}
                        onChange={(e) => updateLivrable(livrable.id, "typeContenu", e.target.value)}
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm"
                      >
                        <option value="">Type</option>
                        {TYPES_CONTENU.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Qté</label>
                      <input
                        type="number"
                        min="1"
                        value={livrable.quantite}
                        onChange={(e) => updateLivrable(livrable.id, "quantite", parseInt(e.target.value) || 1)}
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm text-center"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Prix marque €</label>
                      <input
                        type="number"
                        min="0"
                        value={livrable.prixDemande}
                        onChange={(e) => updateLivrable(livrable.id, "prixDemande", e.target.value)}
                        placeholder="Proposé"
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Prix souhaité €</label>
                      <input
                        type="number"
                        min="0"
                        value={livrable.prixSouhaite}
                        onChange={(e) => updateLivrable(livrable.id, "prixSouhaite", e.target.value)}
                        placeholder="Voulu"
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-green-50"
                      />
                    </div>
                    <div className="col-span-1 flex items-end">
                      <button
                        type="button"
                        onClick={() => removeLivrable(livrable.id)}
                        disabled={livrables.length === 1}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totaux */}
            {(totalDemande > 0 || totalSouhaite > 0) && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-8">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Budget marque</p>
                  <p className="text-lg font-semibold text-gray-600">{formatMoney(totalDemande)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Budget souhaité</p>
                  <p className="text-lg font-bold text-green-600">{formatMoney(totalSouhaite)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Brief & Deadline */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Brief & Deadline
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Brief / Contexte</label>
                <textarea
                  name="brief"
                  value={formData.brief}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Ce que la marque souhaite, contexte de la demande..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm resize-none"
                />
              </div>
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <Calendar className="w-4 h-4 inline mr-1" /> Date limite de réponse
                </label>
                <input
                  type="date"
                  name="dateDeadline"
                  value={formData.dateDeadline}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link href="/negociations" className="px-4 py-2.5 text-gray-600 hover:text-gray-800">Annuler</Link>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-glowup-licorice text-white font-medium rounded-lg hover:bg-glowup-licorice/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Créer la négociation
            </button>
          </div>
        </form>
      </div>

      <QuickMarqueModal isOpen={showMarqueModal} onClose={() => setShowMarqueModal(false)} onCreated={handleMarqueCreated} />
    </>
  );
}
