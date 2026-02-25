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
  Percent,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  ChevronDown,
  Trash2,
  Package,
  Search,
} from "lucide-react";
import { LISTE_PAYS } from "@/lib/pays";

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  commissionInbound: number;
  commissionOutbound: number;
  tarifs: Record<string, number | null> | null;
}

// Résultat API recherche entreprise (api.gouv.fr)
interface EntrepriseSearchResult {
  nom_entreprise: string;
  denomination?: string;
  siret: string | null;
  numero_tva_intracommunautaire: string | null;
  adresse: string | null;
  complement: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string;
}

interface Livrable {
  id: string;
  // Libellé libre du livrable (ce qui sera enregistré en base)
  typeContenu: string;
  // Type préréglé (STORY, POST, ...) pour auto-remplir tarif & libellé, optionnel
  presetType?: string;
  quantite: number;
  prixUnitaire: string;
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

export default function NewCollaborationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [selectedTalent, setSelectedTalent] = useState<Talent | null>(null);

  // Recherche entreprise (API api.gouv.fr)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EntrepriseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Détection du rôle
  const user = session?.user as { id: string; role: string; name: string } | undefined;
  const isTM = user?.role === "TM";

  const [formData, setFormData] = useState({
    talentId: searchParams.get("talent") || "",
    source: "INBOUND",
    description: "",
    commissionPercent: "",
    isLongTerme: false,
  });

  // Bloc facturation client — toujours rempli à la création de collab
  const [billingData, setBillingData] = useState({
    raisonSociale: "",
    adresseRue: "",
    codePostal: "",
    ville: "",
    pays: "France",
    siret: "",
    numeroTVA: "",
  });

  const [livrables, setLivrables] = useState<Livrable[]>([
    { id: "1", typeContenu: "", presetType: "", quantite: 1, prixUnitaire: "", description: "" },
  ]);

  // Calculs
  const totalBrut = livrables.reduce((acc, l) => {
    const prix = parseFloat(l.prixUnitaire) || 0;
    return acc + prix * l.quantite;
  }, 0);
  const commissionPercent = parseFloat(formData.commissionPercent) || 0;
  const commissionEuros = (totalBrut * commissionPercent) / 100;
  const montantNet = totalBrut - commissionEuros;

  useEffect(() => {
    fetchTalents();
  }, []);

  useEffect(() => {
    if (selectedTalent) {
      const commission =
        formData.source === "INBOUND"
          ? selectedTalent.commissionInbound
          : selectedTalent.commissionOutbound;
      setFormData((prev) => ({ ...prev, commissionPercent: commission.toString() }));
    }
  }, [selectedTalent, formData.source]);

  const fetchTalents = async () => {
    try {
      const res = await fetch("/api/talents");
      const data = await res.json();
      
      // Si TM, filtrer pour ne montrer que SES talents
      const filteredTalents = isTM 
        ? data.filter((t: any) => t.manager?.id === user?.id)
        : data;
      
      setTalents(filteredTalents);
      const preselectedId = searchParams.get("talent");
      if (preselectedId) {
        const talent = filteredTalents.find((t: Talent) => t.id === preselectedId);
        if (talent) setSelectedTalent(talent);
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  };

  const handleTalentChange = (talentId: string) => {
    setFormData((prev) => ({ ...prev, talentId }));
    const talent = talents.find((t) => t.id === talentId);
    setSelectedTalent(talent || null);
  };

  const searchEntreprise = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    setShowSearchResults(true);
    try {
      const res = await fetch(`/api/recherche-entreprise?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.results) setSearchResults(data.results);
      else setSearchResults([]);
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const fillFromSearchResult = (e: EntrepriseSearchResult) => {
    const adresseRue = [e.adresse, e.complement].filter(Boolean).join(" – ") || "";
    setBillingData({
      raisonSociale: e.nom_entreprise || "",
      adresseRue,
      codePostal: e.code_postal || "",
      ville: e.ville || "",
      pays: e.pays || "France",
      siret: e.siret || "",
      numeroTVA: e.numero_tva_intracommunautaire || "",
    });
    setShowSearchResults(false);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
  };

  // Gestion des livrables
  const addLivrable = () => {
    setLivrables((prev) => [
      ...prev,
      { id: Date.now().toString(), typeContenu: "", presetType: "", quantite: 1, prixUnitaire: "", description: "" },
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
        return { ...l, [field]: value };
      })
    );
  };

  // Quand on choisit un type préréglé (Story, Post, etc.) :
  // - on stocke la valeur technique dans presetType
  // - on remplit le libellé libre typeContenu avec le label humain
  // - on auto-remplit le prix si le talent a un tarif configuré
  const handlePresetTypeChange = (id: string, presetValue: string) => {
    setLivrables((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const typeInfo = TYPES_CONTENU.find((t) => t.value === presetValue);
        const updated: Livrable = {
          ...l,
          presetType: presetValue || "",
          typeContenu: typeInfo ? typeInfo.label : l.typeContenu,
        };

        if (typeInfo && selectedTalent?.tarifs && selectedTalent.tarifs[typeInfo.tarifKey]) {
          updated.prixUnitaire = selectedTalent.tarifs[typeInfo.tarifKey]!.toString();
        }

        return updated;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation livrables
    const validLivrables = livrables.filter((l) => l.typeContenu && l.prixUnitaire);
    if (validLivrables.length === 0) {
      alert("Ajoutez au moins un livrable");
      return;
    }

    // Validation facturation client (obligatoire pour devis / facture)
    if (!billingData.raisonSociale.trim() || !billingData.adresseRue.trim() || !billingData.codePostal.trim() || !billingData.ville.trim() || !billingData.pays.trim()) {
      alert("Complétez les informations de facturation client (raison sociale, adresse, code postal, ville, pays). Vous pouvez les remplir à la main ou rechercher une entreprise ci‑dessous.");
      return;
    }

    setLoading(true);
    try {
      // 1. Créer la marque avec les infos de facturation
      const marqueRes = await fetch("/api/marques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: billingData.raisonSociale.trim(),
          raisonSociale: billingData.raisonSociale.trim(),
          adresseRue: billingData.adresseRue.trim(),
          codePostal: billingData.codePostal.trim(),
          ville: billingData.ville.trim(),
          pays: billingData.pays.trim(),
          siret: billingData.siret.trim() || null,
          numeroTVA: billingData.numeroTVA.trim() || null,
        }),
      });
      if (!marqueRes.ok) {
        const err = await marqueRes.json();
        alert(err.message || "Erreur lors de la création de la marque");
        setLoading(false);
        return;
      }
      const marque = await marqueRes.json();

      // 2. Créer la collaboration
      const res = await fetch("/api/collaborations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          marqueId: marque.id,
          livrables: validLivrables.map((l) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite,
            prixUnitaire: parseFloat(l.prixUnitaire),
            description: l.description || null,
          })),
          montantBrut: totalBrut,
          commissionPercent,
          commissionEuros,
          montantNet,
          billing: {
            raisonSociale: billingData.raisonSociale.trim(),
            adresseRue: billingData.adresseRue.trim(),
            codePostal: billingData.codePostal.trim(),
            ville: billingData.ville.trim(),
            pays: billingData.pays.trim(),
            siret: billingData.siret.trim() || null,
            numeroTVA: billingData.numeroTVA.trim() || null,
          },
        }),
      });

      if (res.ok) {
        const collab = await res.json();
        router.push(`/collaborations/${collab.id}`);
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
          <Link href="/collaborations" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-glowup-licorice">Nouvelle collaboration</h1>
            <p className="text-sm text-gray-500">Créer une collaboration talent × marque</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Partenaires */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            <div>
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
                      <option value="">Sélectionner un talent</option>
                      {talents.map((t) => (
                        <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Client / Marque (recherche par nom ou SIRET) *</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          if (!e.target.value.trim()) setShowSearchResults(false);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchEntreprise())}
                        placeholder="Ex : L'Oréal, Nike ou 123 456 789 00012"
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice bg-white text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={searchEntreprise}
                      disabled={searching || searchQuery.trim().length < 2}
                      className="px-4 py-2.5 bg-glowup-licorice text-white rounded-lg hover:bg-glowup-licorice/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                    >
                      {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Rechercher
                    </button>
                  </div>
                  {showSearchResults && (
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {searchResults.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">
                          {searching ? "Recherche..." : "Aucun résultat. Essayez un autre nom ou SIRET."}
                        </div>
                      ) : (
                        searchResults.map((ent, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => fillFromSearchResult(ent)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                          >
                            <p className="font-medium text-gray-900">{ent.nom_entreprise}</p>
                            {(ent.siret || ent.ville) && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {[ent.siret, [ent.code_postal, ent.ville].filter(Boolean).join(" ")].filter(Boolean).join(" • ")}
                              </p>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1.5">
                    Recherche via API officielle (api.gouv.fr). Vous pouvez aussi remplir la facturation à la main ci‑dessous.
                  </p>
                </div>
              </div>
            </div>

            {/* Facturation client pour devis / factures */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  Facturation client (devis / facture)
                </h3>
                <p className="text-xs text-gray-500">
                  Remplir manuellement ou importer via la recherche ci‑dessus.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Raison sociale / Nom du client *
                  </label>
                  <input
                    type="text"
                    value={billingData.raisonSociale}
                    onChange={(e) => setBillingData((prev) => ({ ...prev, raisonSociale: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                    placeholder="Ex : L'ORÉAL FRANCE SAS"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse de facturation *</label>
                    <input
                      type="text"
                      value={billingData.adresseRue}
                      onChange={(e) => setBillingData((prev) => ({ ...prev, adresseRue: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                      placeholder="Rue et numéro"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Code postal *</label>
                    <input
                      type="text"
                      value={billingData.codePostal}
                      onChange={(e) => setBillingData((prev) => ({ ...prev, codePostal: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                      placeholder="75001"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Ville *</label>
                    <input
                      type="text"
                      value={billingData.ville}
                      onChange={(e) => setBillingData((prev) => ({ ...prev, ville: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                      placeholder="Paris"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Pays *</label>
                    <select
                      value={billingData.pays}
                      onChange={(e) => setBillingData((prev) => ({ ...prev, pays: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm bg-white"
                      required
                    >
                      {LISTE_PAYS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      SIRET <span className="text-gray-400 text-xs">(recommandé)</span>
                    </label>
                    <input
                      type="text"
                      value={billingData.siret}
                      onChange={(e) => setBillingData((prev) => ({ ...prev, siret: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                      placeholder="123 456 789 00010"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      N° TVA intracom <span className="text-gray-400 text-xs">(recommandé)</span>
                    </label>
                    <input
                      type="text"
                      value={billingData.numeroTVA}
                      onChange={(e) => setBillingData((prev) => ({ ...prev, numeroTVA: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                      placeholder="FR 12 345678900"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Source</h2>
            <div className={`grid ${isTM ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, source: "INBOUND" }))}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  formData.source === "INBOUND" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${formData.source === "INBOUND" ? "bg-blue-100" : "bg-gray-100"}`}>
                    <ArrowDownLeft className={`w-4 h-4 ${formData.source === "INBOUND" ? "text-blue-600" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <p className={`font-medium ${formData.source === "INBOUND" ? "text-blue-700" : "text-gray-700"}`}>Inbound</p>
                    <p className="text-xs text-gray-500">La marque nous contacte</p>
                  </div>
                </div>
                {selectedTalent && formData.source === "INBOUND" && (
                  <p className="text-sm font-semibold text-blue-600 mt-3 pl-11">{selectedTalent.commissionInbound}% commission</p>
                )}
              </button>
              
              {/* OUTBOUND caché pour les TM */}
              {!isTM && (
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, source: "OUTBOUND" }))}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    formData.source === "OUTBOUND" ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${formData.source === "OUTBOUND" ? "bg-green-100" : "bg-gray-100"}`}>
                      <ArrowUpRight className={`w-4 h-4 ${formData.source === "OUTBOUND" ? "text-green-600" : "text-gray-400"}`} />
                    </div>
                    <div>
                      <p className={`font-medium ${formData.source === "OUTBOUND" ? "text-green-700" : "text-gray-700"}`}>Outbound</p>
                      <p className="text-xs text-gray-500">On démarche la marque</p>
                    </div>
                  </div>
                  {selectedTalent && formData.source === "OUTBOUND" && (
                    <p className="text-sm font-semibold text-green-600 mt-3 pl-11">{selectedTalent.commissionOutbound}% commission</p>
                  )}
                </button>
              )}
            </div>
            
            {/* Message info pour TM */}
            {isTM && (
              <p className="mt-3 text-xs text-gray-500 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                En tant que TM, vous gérez uniquement les collaborations INBOUND (mails entrants)
              </p>
            )}
          </div>

          {/* Livrables */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4" />
                Livrables
              </h2>
              <button
                type="button"
                onClick={addLivrable}
                className="flex items-center gap-1 text-sm text-glowup-licorice hover:text-glowup-rose transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </div>

            <div className="space-y-3">
              {livrables.map((livrable, index) => (
                <div
                  key={livrable.id}
                  className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1 grid grid-cols-12 gap-3">
                    {/* Type préréglé + libellé libre */}
                    <div className="col-span-4 space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Type (préréglé)</label>
                        <select
                          value={livrable.presetType || ""}
                          onChange={(e) => handlePresetTypeChange(livrable.id, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice appearance-none bg-white text-sm"
                        >
                          <option value="">Sélectionner</option>
                          {TYPES_CONTENU.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Libellé du livrable *</label>
                        <input
                          type="text"
                          value={livrable.typeContenu}
                          onChange={(e) => updateLivrable(livrable.id, "typeContenu", e.target.value)}
                          placeholder="Ex : 1x Story IG + 1x Post TikTok"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                        />
                      </div>
                    </div>

                    {/* Quantité */}
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Qté</label>
                      <input
                        type="number"
                        min="1"
                        value={livrable.quantite}
                        onChange={(e) => updateLivrable(livrable.id, "quantite", parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm text-center"
                      />
                    </div>

                    {/* Prix unitaire */}
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Prix unit. € HT *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={livrable.prixUnitaire}
                        onChange={(e) => updateLivrable(livrable.id, "prixUnitaire", e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm"
                      />
                    </div>

                    {/* Total ligne */}
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Total</label>
                      <div className="px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm font-semibold text-glowup-licorice">
                        {formatMoney((parseFloat(livrable.prixUnitaire) || 0) * livrable.quantite)}
                      </div>
                    </div>
                  </div>

                  {/* Supprimer */}
                  <button
                    type="button"
                    onClick={() => removeLivrable(livrable.id)}
                    disabled={livrables.length === 1}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Description globale */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optionnel)</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={2}
                placeholder="Notes supplémentaires..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-glowup-licorice text-sm resize-none"
              />
            </div>

            {/* Long terme */}
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                name="isLongTerme"
                checked={formData.isLongTerme}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-glowup-licorice focus:ring-glowup-licorice"
              />
              <span className="text-sm text-gray-600">Collaboration long terme</span>
            </label>
          </div>

          {/* Récapitulatif */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Récapitulatif</h2>

            <div className="space-y-3">
              {/* Liste des livrables */}
              {livrables.filter((l) => l.typeContenu && l.prixUnitaire).map((l) => {
                const total = (parseFloat(l.prixUnitaire) || 0) * l.quantite;
                return (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {l.quantite}x {l.typeContenu}
                    </span>
                    <span className="font-medium text-glowup-licorice">{formatMoney(total)}</span>
                  </div>
                );
              })}

              {livrables.filter((l) => l.typeContenu && l.prixUnitaire).length === 0 && (
                <p className="text-sm text-gray-400 italic">Aucun livrable ajouté</p>
              )}

              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total brut HT</span>
                  <span className="text-lg font-bold text-glowup-licorice">{formatMoney(totalBrut)}</span>
                </div>
              </div>

              {/* Commission */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Commission (HT)</span>
                  <div className="relative">
                    <input
                      type="number"
                      name="commissionPercent"
                      value={formData.commissionPercent}
                      onChange={handleChange}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-16 px-2 py-1 rounded border border-gray-200 text-sm text-center"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                  </div>
                </div>
                <span className="font-semibold text-glowup-rose">{formatMoney(commissionEuros)}</span>
              </div>

              {/* Net */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <span className="font-medium text-gray-700">Net talent (HT)</span>
                <span className="text-lg font-bold text-green-600">{formatMoney(montantNet)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link href="/collaborations" className="px-4 py-2.5 text-gray-600 hover:text-gray-800 transition-colors">
              Annuler
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-glowup-licorice text-white font-medium rounded-lg hover:bg-glowup-licorice/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Créer la collaboration
            </button>
          </div>
        </form>
      </div>

    </>
  );
}
