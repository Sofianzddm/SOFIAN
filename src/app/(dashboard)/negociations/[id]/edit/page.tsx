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
  { value: "POST_CROSSPOST", label: "IG Post Crosspost" },
  { value: "REEL", label: "Reel" },
  { value: "REEL_CROSSPOST", label: "IG Réel Crosspost" },
  { value: "REEL_CONCOURS", label: "IG Réel Jeu Concours" },
  { value: "TIKTOK_VIDEO", label: "Vidéo TikTok" },
  { value: "TIKTOK_VIDEO_CONCOURS", label: "TikTok Jeu Concours" },
  { value: "YOUTUBE_VIDEO", label: "Vidéo YouTube" },
  { value: "YOUTUBE_SHORT", label: "YouTube Short" },
  { value: "SNAPCHAT_STORY", label: "Snapchat Story" },
  { value: "SNAPCHAT_SPOTLIGHT", label: "Snapchat Spotlight" },
  { value: "EVENT", label: "Event" },
  { value: "SHOOTING", label: "Shooting" },
  { value: "AMBASSADEUR", label: "Ambassadeur" },
];

const TYPE_TO_TARIF_KEY: Record<string, string> = {
  STORY: "tarifStory", STORY_CONCOURS: "tarifStoryConcours", POST: "tarifPost",
  POST_CONCOURS: "tarifPostConcours", POST_COMMUN: "tarifPostCommun", POST_CROSSPOST: "tarifPostCrosspost",
  REEL: "tarifReel", REEL_CROSSPOST: "tarifReelCrosspost", REEL_CONCOURS: "tarifReelConcours",
  TIKTOK_VIDEO: "tarifTiktokVideo", TIKTOK_VIDEO_CONCOURS: "tarifTiktokConcours",
  YOUTUBE_VIDEO: "tarifYoutubeVideo", YOUTUBE_SHORT: "tarifYoutubeShort",
  SNAPCHAT_STORY: "tarifSnapchatStory", SNAPCHAT_SPOTLIGHT: "tarifSnapchatSpotlight",
  EVENT: "tarifEvent", SHOOTING: "tarifShooting", AMBASSADEUR: "tarifAmbassadeur",
};

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  commissionInbound: number;
  commissionOutbound: number;
  tarifs?: any;
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
  const userRole = (session?.user as { role?: string })?.role;
  const isTM = userRole === "TM";
  const isHeadOfInfluence = userRole === "HEAD_OF" || userRole === "HEAD_OF_INFLUENCE" || userRole === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [negoStatut, setNegoStatut] = useState<string>("");

  const [formData, setFormData] = useState({
    talentId: "",
    nomMarqueSaisi: "",
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
  }, [params.id]);

  // TM ne gère que les entrants → forcer INBOUND
  useEffect(() => {
    if (isTM && formData.source === "OUTBOUND") {
      setFormData((prev) => ({ ...prev, source: "INBOUND" }));
    }
  }, [isTM, formData.source]);

  const fetchNegociation = async () => {
    try {
      const res = await fetch(`/api/negociations/${params.id}`);
      if (res.ok) {
        const nego = await res.json();
        setNegoStatut(nego.statut); // 🔍 Capturer le statut
        setFormData({
          talentId: nego.talentId,
          nomMarqueSaisi: nego.nomMarqueSaisi || nego.marque?.nom || "",
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

    const explicitKey = TYPE_TO_TARIF_KEY[typeContenu];
    if (explicitKey && selectedTalent.tarifs[explicitKey] != null) return Number(selectedTalent.tarifs[explicitKey]);

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
        const tarifKey = TYPE_TO_TARIF_KEY[type.value] ?? `tarif${type.value.charAt(0) + type.value.slice(1).toLowerCase().replace(/_./g, (m) => m[1].toUpperCase())}`;
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
          nomMarqueSaisi: formData.nomMarqueSaisi || null,
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
            <h1 className="text-2xl font-bold text-glowup-licorice">
              {isHeadOfInfluence ? "Contre-proposition" : "Modifier la négociation"}
            </h1>
            <p className="text-gray-500 text-sm">
              {isHeadOfInfluence ? "Fixez les montants accordés par livrable (colonne Prix final), puis enregistrez." : "Mise à jour des informations"}
            </p>
          </div>
        </div>
      </div>

      {/* Bandeau contre-proposition — Head of Influence */}
      {isHeadOfInfluence && (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
          <p className="font-semibold text-blue-900 text-sm">Contre-proposition (Head of Influence)</p>
          <p className="text-xs text-blue-800 mt-0.5">
            Le TM a saisi la <strong>proposition initiale</strong> (Prix marque, Prix souhaité). Vous fixez ici le <strong>Prix final (accord)</strong> par livrable — c’est votre contre-proposition. Ces montants seront utilisés à la validation pour créer la collaboration. Enregistrez puis revenez sur la négociation pour valider.
          </p>
        </div>
      )}

      {/* Rappel pour le TM : qui remplit quoi */}
      {!isHeadOfInfluence && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-700">
            Vous modifiez <strong>votre proposition</strong> (Prix marque, Prix souhaité). La colonne <strong>« Final € »</strong> est réservée à la Head of Influence pour sa contre-proposition avant validation.
          </p>
        </div>
      )}

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

      {/* Avertissement — masqué pour Head of Influence (déjà expliqué au-dessus) */}
      {!isHeadOfInfluence && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-slate-800 text-sm">Modifier la proposition</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Vous pouvez mettre à jour le budget marque et les montants à tout moment tant que la négo n’est pas validée. Si la marque revient avec un nouveau prix, modifiez les champs ici et résumez l’échange dans la <strong>Discussion</strong> de la fiche négo.
            </p>
          </div>
        </div>
      )}

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
              <label className={labelClass}>Nom de la marque *</label>
              <input
                type="text"
                name="nomMarqueSaisi"
                value={formData.nomMarqueSaisi}
                onChange={(e) => setFormData({ ...formData, nomMarqueSaisi: e.target.value })}
                placeholder="Ex: Nike France"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Source *</label>
              <select
                name="source"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
                required
                className={inputClass}
                disabled={isTM}
              >
                {SOURCES.filter((s) => !isTM || s === "INBOUND").map((s) => (
                  <option key={s} value={s}>
                    {s === "INBOUND" ? "Inbound (entrant)" : "Outbound"}
                  </option>
                ))}
              </select>
              {isTM && (
                <p className="text-xs text-gray-500 mt-1">En tant que TM vous gérez uniquement les négociations entrantes.</p>
              )}
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
              <label className={labelClass}>Budget marque € HT</label>
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
              <label className={labelClass}>Budget souhaité € HT</label>
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
              <label className={labelClass}>Budget final € HT</label>
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

          {isHeadOfInfluence ? (
            <p className="mb-3 text-xs text-blue-700">
              Renseignez uniquement la colonne <strong>Prix final €</strong> (votre accord par livrable). Les autres colonnes viennent de la proposition du TM.
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-500">
              Proposition TM : Prix marque (ce qu’ils proposent), Prix souhaité (votre cible). <strong>Prix final</strong> = à remplir par la Head of Influence (contre-propo.).
            </p>
          )}
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
                        <div className="col-span-2">
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
                        <div className="col-span-1">
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
                          <label className="block text-xs text-gray-500 mb-1">Notre prix €</label>
                          <div className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-gray-100 text-gray-700 font-medium">
                            {livrable.typeContenu
                              ? getTarifRecommande(livrable.typeContenu) != null
                                ? formatMoney(getTarifRecommande(livrable.typeContenu)!)
                                : "—"
                              : "—"}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">Grille DB</p>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Prix marque € HT <span className="text-slate-400">(TM)</span></label>
                          <input
                            type="number"
                            min="0"
                            value={livrable.prixDemande || ""}
                            onChange={(e) => updateLivrable(livrable.id, "prixDemande", e.target.value)}
                            placeholder="Proposé par la marque"
                            className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Prix souhaité € HT <span className="text-slate-400">(TM)</span></label>
                          <input
                            type="number"
                            min="0"
                            value={livrable.prixSouhaite || ""}
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
                        <div className="col-span-1">
                          <label className="block text-xs text-gray-500 mb-1" title="Contre-proposition Head of : montant accordé à la validation">
                            Prix final € <span className="text-blue-600">(Head of)</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={livrable.prixFinal || ""}
                            onChange={(e) => updateLivrable(livrable.id, "prixFinal", e.target.value)}
                            placeholder={isHeadOfInfluence ? "Votre accord" : "—"}
                            className="w-full px-2 py-2 rounded-lg border border-blue-200 text-sm bg-blue-50 focus:ring-2 focus:ring-blue-200"
                          />
                          {isHeadOfInfluence && (
                            <p className="text-[10px] text-blue-600 mt-0.5">Votre contre-propo.</p>
                          )}
                          {!isHeadOfInfluence && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Rempli par Head of</p>
                          )}
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
