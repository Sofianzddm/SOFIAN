"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
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
  Send,
} from "lucide-react";
interface Talent {
  id: string;
  prenom: string;
  nom: string;
  tarifs: Record<string, number | null> | null;
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
  const { data: session } = useSession();
  const user = session?.user as { role?: string } | undefined;
  const isTM = user?.role === "TM";

  const [loading, setLoading] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [selectedTalent, setSelectedTalent] = useState<Talent | null>(null);

  const [formData, setFormData] = useState({
    talentId: searchParams.get("talent") || "",
    nomMarqueSaisi: searchParams.get("marque") || "", // Nom libre ; fiche marque créée/reliée à la validation
    contactMarque: "",
    emailContact: "",
    source: "INBOUND" as "INBOUND" | "OUTBOUND",
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
  }, []);

  // TM ne gère que les entrants → forcer INBOUND
  useEffect(() => {
    if (isTM) setFormData((prev) => ({ ...prev, source: "INBOUND" }));
  }, [isTM]);

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

  const handleTalentChange = (talentId: string) => {
    setFormData((prev) => ({ ...prev, talentId }));
    const talent = talents.find((t) => t.id === talentId);
    setSelectedTalent(talent || null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
        if (field === "typeContenu" && selectedTalent?.tarifs && typeof value === "string") {
          console.log("🔍 Recherche tarif pour:", value);
          console.log("📊 Tarifs disponibles:", selectedTalent.tarifs);
          
          // Normaliser la valeur pour la comparaison
          const normalizeStr = (str: string) => 
            str.toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Enlever accents
              .replace(/\s+/g, ""); // Enlever espaces
          
          const valueNorm = normalizeStr(value);
          
          // Essayer de trouver une correspondance exacte d'abord
          let typeInfo = TYPES_CONTENU.find((t) => 
            t.value === value || 
            t.label === value ||
            normalizeStr(t.label) === valueNorm
          );
          
          // Si pas de correspondance exacte, essayer une correspondance partielle
          if (!typeInfo) {
            typeInfo = TYPES_CONTENU.find((t) => {
              const labelNorm = normalizeStr(t.label);
              return labelNorm.includes(valueNorm) || valueNorm.includes(labelNorm);
            });
          }
          
          console.log("✅ Type trouvé:", typeInfo?.label || "Aucun");
          
          // Si on a trouvé un type correspondant et que le talent a ce tarif
          if (typeInfo && selectedTalent.tarifs[typeInfo.tarifKey]) {
            const tarifTalent = selectedTalent.tarifs[typeInfo.tarifKey];
            console.log("💰 Tarif trouvé:", tarifTalent);
            // Auto-remplir uniquement si le champ prix souhaité est vide
            if (!l.prixSouhaite && tarifTalent) {
              updated.prixSouhaite = tarifTalent.toString();
              console.log("✨ Prix souhaité auto-rempli:", tarifTalent);
            }
          } else {
            console.log("❌ Aucun tarif trouvé pour ce type");
          }
        }
        return updated;
      })
    );
  };

  // Fonction pour obtenir le tarif recommandé du talent pour un type de contenu
  const getTarifRecommande = (typeContenu: string): number | null => {
    if (!selectedTalent?.tarifs || !typeContenu) return null;
    
    // Normaliser la valeur pour la comparaison
    const normalizeStr = (str: string) => 
      str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Enlever accents
        .replace(/\s+/g, ""); // Enlever espaces
    
    const valueNorm = normalizeStr(typeContenu);
    
    // Essayer de trouver une correspondance exacte d'abord
    let typeInfo = TYPES_CONTENU.find((t) => 
      t.value === typeContenu || 
      t.label === typeContenu ||
      normalizeStr(t.label) === valueNorm
    );
    
    // Si pas de correspondance exacte, essayer une correspondance partielle
    if (!typeInfo) {
      typeInfo = TYPES_CONTENU.find((t) => {
        const labelNorm = normalizeStr(t.label);
        return labelNorm.includes(valueNorm) || valueNorm.includes(labelNorm);
      });
    }
    
    if (typeInfo && selectedTalent.tarifs[typeInfo.tarifKey]) {
      return selectedTalent.tarifs[typeInfo.tarifKey] as number;
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent, shouldSubmit: boolean = false) => {
    e.preventDefault();
    const validLivrables = livrables.filter((l) => l.typeContenu);
    if (validLivrables.length === 0) {
      alert("Ajoutez au moins un livrable");
      return;
    }

    setLoading(true);
    try {
      // 1. Créer la négociation (BROUILLON)
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

        // 2. Si "Soumettre", appeler l'endpoint /soumettre
        if (shouldSubmit) {
          const submitRes = await fetch(`/api/negociations/${nego.id}/soumettre`, {
            method: "POST",
          });
          
          if (!submitRes.ok) {
            const error = await submitRes.json();
            alert(error.error || "Erreur lors de la soumission");
          }
        }

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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de la marque *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    name="nomMarqueSaisi"
                    value={formData.nomMarqueSaisi}
                    onChange={handleChange}
                    placeholder="Ex: Nike France"
                    required
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">La fiche marque sera créée ou reliée à la validation (évite les doublons)</p>
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
            <div className={`grid gap-3 ${isTM ? "grid-cols-1" : "grid-cols-2"}`}>
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
              {!isTM && (
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
              )}
            </div>
            {isTM && (
              <p className="text-xs text-gray-500 mt-3 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full" />
                En tant que Talent Manager, vous gérez uniquement les négociations entrantes (Inbound).
              </p>
            )}
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

            <div className="space-y-6">
              {livrables.map((livrable) => (
                <div key={livrable.id} className="flex items-start gap-3 p-4 pb-6 bg-gray-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-12 gap-3">
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Type *</label>
                      <input
                        type="text"
                        list={`types-contenu-${livrable.id}`}
                        value={livrable.typeContenu}
                        onChange={(e) => updateLivrable(livrable.id, "typeContenu", e.target.value)}
                        placeholder="Choisir ou écrire..."
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose/20"
                      />
                      <datalist id={`types-contenu-${livrable.id}`}>
                        {TYPES_CONTENU.map((type) => (
                          <option key={type.value} value={type.label} />
                        ))}
                      </datalist>
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
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Notre prix €</label>
                      <div className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-gray-100 text-gray-700 font-medium">
                        {livrable.typeContenu
                          ? (getTarifRecommande(livrable.typeContenu) != null
                              ? formatMoney(getTarifRecommande(livrable.typeContenu)!)
                              : "—")
                          : "—"}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Grille DB</p>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Prix marque € HT</label>
                      <input
                        type="number"
                        min="0"
                        value={livrable.prixDemande}
                        onChange={(e) => updateLivrable(livrable.id, "prixDemande", e.target.value)}
                        placeholder="Proposé"
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Prix souhaité € HT</label>
                      <input
                        type="number"
                        min="0"
                        value={livrable.prixSouhaite}
                        onChange={(e) => updateLivrable(livrable.id, "prixSouhaite", e.target.value)}
                        placeholder="Cible"
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-green-50"
                      />
                      {livrable.typeContenu && getTarifRecommande(livrable.typeContenu) != null && (
                        <button
                          type="button"
                          onClick={() =>
                            updateLivrable(
                              livrable.id,
                              "prixSouhaite",
                              getTarifRecommande(livrable.typeContenu)!.toString()
                            )
                          }
                          className="text-[10px] text-blue-600 hover:underline mt-0.5"
                        >
                          → Grille
                        </button>
                      )}
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
            {(totalDemande > 0 || totalSouhaite > 0 || livrables.some((l) => getTarifRecommande(l.typeContenu))) && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-6 flex-wrap">
                {livrables.some((l) => getTarifRecommande(l.typeContenu)) && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Total notre prix (grille)</p>
                    <p className="text-lg font-semibold text-gray-600">
                      {formatMoney(
                        livrables.reduce(
                          (acc, l) => acc + (getTarifRecommande(l.typeContenu) || 0) * l.quantite,
                          0
                        )
                      )}
                    </p>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total prix marque</p>
                  <p className="text-lg font-semibold text-glowup-licorice">{formatMoney(totalDemande)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total prix souhaité</p>
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
              type="button"
              onClick={(e) => handleSubmit(e, false)}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer en brouillon
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-glowup-licorice text-white font-medium rounded-lg hover:bg-glowup-licorice/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Soumettre pour validation
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
