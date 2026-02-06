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
  prixUnitaire: number;
  description: string;
}

export default function EditCollaborationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [marques, setMarques] = useState<Marque[]>([]);

  const [formData, setFormData] = useState({
    talentId: "",
    marqueId: "",
    source: "INBOUND",
    description: "",
    isLongTerme: false,
    livrables: [] as Livrable[],
  });

  const [montantBrut, setMontantBrut] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [commissionEuros, setCommissionEuros] = useState(0);
  const [montantNet, setMontantNet] = useState(0);

  useEffect(() => {
    fetchCollaboration();
    fetchTalents();
    fetchMarques();
  }, [params.id]);

  useEffect(() => {
    calculerMontants();
  }, [formData.livrables, formData.source, formData.talentId]);

  const fetchCollaboration = async () => {
    try {
      const res = await fetch(`/api/collaborations/${params.id}`);
      if (res.ok) {
        const collab = await res.json();
        setFormData({
          talentId: collab.talentId,
          marqueId: collab.marqueId,
          source: collab.source,
          description: collab.description || "",
          isLongTerme: collab.isLongTerme,
          livrables: collab.livrables.map((l: any) => ({
            id: l.id,
            typeContenu: l.typeContenu,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
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

  const calculerMontants = () => {
    const brut = formData.livrables.reduce((sum, l) => sum + l.quantite * l.prixUnitaire, 0);
    setMontantBrut(brut);

    const talent = talents.find((t) => t.id === formData.talentId);
    if (talent) {
      const percent =
        formData.source === "INBOUND" ? talent.commissionInbound : talent.commissionOutbound;
      setCommissionPercent(percent);
      const euros = brut * (percent / 100);
      setCommissionEuros(euros);
      setMontantNet(brut - euros);
    }
  };

  const addLivrable = () => {
    setFormData({
      ...formData,
      livrables: [
        ...formData.livrables,
        { id: `new-${Date.now()}`, typeContenu: "", quantite: 1, prixUnitaire: 0, description: "" },
      ],
    });
  };

  const updateLivrable = (id: string, field: keyof Livrable, value: any) => {
    setFormData({
      ...formData,
      livrables: formData.livrables.map((l) =>
        l.id === id ? { ...l, [field]: field === "typeContenu" || field === "description" ? value : Number(value) } : l
      ),
    });
  };

  const removeLivrable = (id: string) => {
    setFormData({
      ...formData,
      livrables: formData.livrables.filter((l) => l.id !== id),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.livrables.length === 0) {
      alert("Veuillez ajouter au moins un livrable");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/collaborations/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentId: formData.talentId,
          marqueId: formData.marqueId,
          source: formData.source,
          description: formData.description,
          isLongTerme: formData.isLongTerme,
          montantBrut,
          commissionPercent,
          commissionEuros,
          montantNet,
          livrables: formData.livrables.map((l) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            description: l.description,
          })),
        }),
      });

      if (res.ok) {
        router.push(`/collaborations/${params.id}`);
      } else {
        const error = await res.json();
        alert(error.message || "Erreur lors de la mise à jour");
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

  const inputClass = "w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/collaborations/${params.id}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-glowup-licorice">Modifier la collaboration</h1>
            <p className="text-gray-500 text-sm">Mise à jour des informations</p>
          </div>
        </div>
      </div>

      {/* Avertissement */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-900 text-sm">⚠️ Attention</p>
          <p className="text-xs text-amber-700 mt-1">
            La modification d'une collaboration peut affecter les documents déjà générés (devis/factures). Assurez-vous de régénérer les documents si nécessaire.
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

          <div className="grid md:grid-cols-3 gap-4">
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

          <div className="mt-4">
            <label className={labelClass}>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className={inputClass}
              placeholder="Description de la collaboration..."
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="isLongTerme"
              checked={formData.isLongTerme}
              onChange={(e) => setFormData({ ...formData, isLongTerme: e.target.checked })}
              className="w-4 h-4 text-glowup-rose border-gray-300 rounded focus:ring-glowup-rose"
            />
            <label htmlFor="isLongTerme" className="text-sm text-gray-700">
              Collaboration long terme
            </label>
          </div>
        </div>

        {/* Livrables */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
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
            <div className="space-y-3">
              {formData.livrables.map((livrable, index) => (
                <div key={livrable.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-4">
                    <span className="w-8 h-8 bg-glowup-lace rounded-full flex items-center justify-center text-sm font-bold text-glowup-licorice flex-shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 grid md:grid-cols-12 gap-3">
                      <div className="md:col-span-4">
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
                      <div className="md:col-span-2">
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
                      <div className="md:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Prix € *</label>
                        <input
                          type="number"
                          min="0"
                          value={livrable.prixUnitaire}
                          onChange={(e) => updateLivrable(livrable.id, "prixUnitaire", e.target.value)}
                          required
                          className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose"
                        />
                      </div>
                      <div className="md:col-span-3 flex items-end">
                        <div className="text-xs text-gray-500">
                          Total: <span className="font-bold text-glowup-licorice">{(livrable.quantite * livrable.prixUnitaire).toFixed(2)} €</span>
                        </div>
                      </div>
                      <div className="md:col-span-12">
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

        {/* Résumé financier */}
        <div className="bg-gradient-to-br from-glowup-licorice to-gray-800 rounded-2xl p-6 text-white mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-white/10 rounded-lg">
              <Euro className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold">Résumé financier</h2>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="text-xs text-white/70 mb-1">Montant brut</div>
              <div className="text-2xl font-bold">{montantBrut.toFixed(2)} €</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="text-xs text-white/70 mb-1">Commission</div>
              <div className="text-2xl font-bold">{commissionPercent}%</div>
              <div className="text-xs text-white/70 mt-1">{commissionEuros.toFixed(2)} €</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="text-xs text-white/70 mb-1">Montant net talent</div>
              <div className="text-2xl font-bold text-glowup-green">{montantNet.toFixed(2)} €</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="text-xs text-white/70 mb-1">Source</div>
              <div className="text-lg font-bold">{formData.source}</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <Link
            href={`/collaborations/${params.id}`}
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
