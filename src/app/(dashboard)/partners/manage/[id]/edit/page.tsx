"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Upload, X } from "lucide-react";

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  niches: string[];
  tarifs?: {
    tarifStory?: number | null;
    tarifPost?: number | null;
    tarifReel?: number | null;
    tarifStoryConcours?: number | null;
    tarifPostConcours?: number | null;
    tarifTiktokVideo?: number | null;
    tarifYoutubeVideo?: number | null;
    tarifYoutubeShort?: number | null;
    tarifPostCommun?: number | null;
    tarifEvent?: number | null;
    tarifShooting?: number | null;
    tarifAmbassadeur?: number | null;
  } | null;
}

interface TarifOverride {
  id: string;
  talentId: string;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
  };
  tarifStory?: number | null;
  tarifPost?: number | null;
  tarifReel?: number | null;
  tarifStoryConcours?: number | null;
  tarifPostConcours?: number | null;
  tarifTiktokVideo?: number | null;
  tarifYoutubeVideo?: number | null;
  tarifYoutubeShort?: number | null;
  tarifPostCommun?: number | null;
  tarifEvent?: number | null;
  tarifShooting?: number | null;
  tarifAmbassadeur?: number | null;
  note?: string | null;
}

export default function EditPartnerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    logo: "",
    contactName: "",
    contactEmail: "",
    message: "",
    description: "",
    isActive: true,
  });
  const [selectedTalents, setSelectedTalents] = useState<string[]>([]);
  const [tarifOverrides, setTarifOverrides] = useState<TarifOverride[]>([]);
  const [expandedTalents, setExpandedTalents] = useState<Set<string>>(new Set());
  const [savingTarifs, setSavingTarifs] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchData();
      fetchTalents();
      fetchTarifOverrides();
    }
  }, [params.id]);

  async function fetchData() {
    try {
      const res = await fetch(`/api/partners/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        const p = data.partner;
        setFormData({
          name: p.name || "",
          logo: p.logo || "",
          contactName: p.contactName || "",
          contactEmail: p.contactEmail || "",
          message: p.message || "",
          description: p.description || "",
          isActive: p.isActive ?? true,
        });
        setLogoPreview(p.logo || null);
        setSelectedTalents(p.talents?.map((t: any) => t.talentId) || []);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTalents() {
    try {
      const res = await fetch("/api/talents?presskit=true");
      if (res.ok) {
        const data = await res.json();
        const talentsList = data.talents || data;
        // Récupérer les tarifs pour chaque talent via l'API détail
        const talentsWithTarifs = await Promise.all(
          talentsList.map(async (talent: Talent) => {
            try {
              const detailRes = await fetch(`/api/talents/${talent.id}`);
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                return { ...talent, tarifs: detailData.tarifs || null };
              }
            } catch (e) {
              console.error(`Erreur fetch tarifs pour ${talent.id}:`, e);
            }
            return { ...talent, tarifs: null };
          })
        );
        setTalents(talentsWithTarifs);
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  }

  async function fetchTarifOverrides() {
    try {
      const res = await fetch(`/api/partners/${params.id}/tarifs`);
      if (res.ok) {
        const data = await res.json();
        setTarifOverrides(data);
      }
    } catch (error) {
      console.error("Erreur fetch overrides:", error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          talentIds: selectedTalents,
        }),
      });
      if (res.ok) {
        router.push(`/partners/manage/${params.id}`);
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  function toggleTalent(talentId: string) {
    setSelectedTalents((prev) =>
      prev.includes(talentId) ? prev.filter((id) => id !== talentId) : [...prev, talentId]
    );
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !params.id) return;

    // Vérifier le type de fichier
    if (!file.type.startsWith("image/")) {
      alert("Veuillez sélectionner une image");
      return;
    }

    // Limite de taille (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("L'image ne doit pas dépasser 10MB");
      return;
    }

    setUploadingLogo(true);

    try {
      // 1. Récupérer la signature
      const signatureRes = await fetch("/api/partners/upload-logo/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: params.id }),
      });

      if (!signatureRes.ok) {
        throw new Error("Erreur de signature");
      }

      const { signature, timestamp, folder, publicId, cloudName, apiKey } = await signatureRes.json();

      // 2. Upload direct vers Cloudinary
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("signature", signature);
      uploadFormData.append("timestamp", timestamp.toString());
      uploadFormData.append("folder", folder);
      uploadFormData.append("public_id", publicId);
      uploadFormData.append("api_key", apiKey);

      const cloudinaryRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: uploadFormData,
        }
      );

      if (!cloudinaryRes.ok) {
        throw new Error("Erreur upload Cloudinary");
      }

      const cloudinaryData = await cloudinaryRes.json();
      const logoUrl = cloudinaryData.secure_url;

      // 3. Mettre à jour la DB avec la nouvelle URL
      const updateRes = await fetch("/api/partners/upload-logo/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: params.id, logoUrl }),
      });

      if (!updateRes.ok) {
        throw new Error("Erreur mise à jour DB");
      }

      // Mettre à jour l'état local
      setFormData((prev) => ({ ...prev, logo: logoUrl }));
      setLogoPreview(logoUrl);
    } catch (error) {
      console.error("Erreur upload logo:", error);
      alert("Erreur lors de l'upload du logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  function removeLogo() {
    setLogoPreview(null);
    setFormData((prev) => ({ ...prev, logo: "" }));
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href={`/partners/manage/${params.id}`} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Retour au détail
      </Link>

      <h1 className="text-3xl font-bold mb-8">Éditer le partenaire</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Nom de l'agence *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Logo</label>
          
          {logoPreview || formData.logo ? (
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden p-2">
                <img
                  src={logoPreview || formData.logo}
                  alt="Logo preview"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <button
                type="button"
                onClick={removeLogo}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <label className="cursor-pointer">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Cliquez pour uploader un logo
                  </span>
                  <span className="text-xs text-gray-400">
                    PNG, JPG, WEBP (max 10MB)
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={uploadingLogo}
                />
              </label>
            </div>
          )}
          
          {uploadingLogo && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Upload en cours...
            </div>
          )}
          
          {/* Option alternative : URL manuelle */}
          <div className="mt-4">
            <label className="block text-xs text-gray-500 mb-1">Ou entrez une URL</label>
            <input
              type="text"
              value={formData.logo}
              onChange={(e) => {
                setFormData({ ...formData, logo: e.target.value });
                if (e.target.value) {
                  setLogoPreview(e.target.value);
                } else {
                  setLogoPreview(null);
                }
              }}
              className="w-full px-4 py-2 border rounded-lg text-sm"
              placeholder="https://res.cloudinary.com/..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nom du contact</label>
            <input
              type="text"
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email du contact</label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Message d'accueil personnalisé</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            rows={2}
          />
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Partenaire actif</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-4">
            Sélectionner les talents ({selectedTalents.length} sélectionnés)
          </label>
          <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {talents.map((talent) => {
                const isSelected = selectedTalents.includes(talent.id);
                return (
                  <button
                    key={talent.id}
                    type="button"
                    onClick={() => toggleTalent(talent.id)}
                    className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
                      isSelected ? "border-blue-600 bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4" />
                    {talent.photo ? (
                      <img src={talent.photo} alt={talent.prenom} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        {talent.prenom[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {talent.prenom} {talent.nom}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{talent.niches.slice(0, 2).join(", ")}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t">
          <Link href={`/partners/manage/${params.id}`} className="px-6 py-2 border rounded-lg hover:bg-gray-50">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving || !formData.name}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Sauvegarder
              </>
            )}
          </button>
        </div>
      </form>

      {/* Section Tarifs négociés */}
      <div className="mt-12 bg-white rounded-lg border p-6">
        <h2 className="text-2xl font-bold mb-2">💰 Tarifs négociés</h2>
        <p className="text-sm text-gray-600 mb-6">
          Modifier les tarifs uniquement pour ce partenaire. Laisser vide = tarif par défaut.
        </p>

        <div className="space-y-3">
          {talents.map((talent) => {
            const override = tarifOverrides.find((o) => o.talentId === talent.id);
            const hasOverride = override && (
              (override.tarifStory !== null && override.tarifStory !== undefined) ||
              (override.tarifPost !== null && override.tarifPost !== undefined) ||
              (override.tarifReel !== null && override.tarifReel !== undefined) ||
              (override.tarifStoryConcours !== null && override.tarifStoryConcours !== undefined) ||
              (override.tarifPostConcours !== null && override.tarifPostConcours !== undefined) ||
              (override.tarifTiktokVideo !== null && override.tarifTiktokVideo !== undefined) ||
              (override.tarifYoutubeVideo !== null && override.tarifYoutubeVideo !== undefined) ||
              (override.tarifYoutubeShort !== null && override.tarifYoutubeShort !== undefined) ||
              (override.tarifPostCommun !== null && override.tarifPostCommun !== undefined) ||
              (override.tarifEvent !== null && override.tarifEvent !== undefined) ||
              (override.tarifShooting !== null && override.tarifShooting !== undefined) ||
              (override.tarifAmbassadeur !== null && override.tarifAmbassadeur !== undefined)
            );
            const isExpanded = expandedTalents.has(talent.id);

            return (
              <div key={talent.id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    const newExpanded = new Set(expandedTalents);
                    if (isExpanded) {
                      newExpanded.delete(talent.id);
                    } else {
                      newExpanded.add(talent.id);
                    }
                    setExpandedTalents(newExpanded);
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {talent.photo ? (
                      <img
                        src={talent.photo}
                        alt={`${talent.prenom} ${talent.nom}`}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        {talent.prenom[0]}
                      </div>
                    )}
                    <span className="font-medium">
                      {talent.prenom} {talent.nom}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      hasOverride
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {hasOverride
                      ? `Tarif négocié avec accord (${formData.name || "Partenaire"})`
                      : "Tarifs défaut"}
                  </span>
                </button>

                {isExpanded && (
                  <TalentTarifForm
                    talent={talent}
                    override={override}
                    partnerId={params.id!}
                    onSave={() => {
                      fetchTarifOverrides();
                    }}
                    onReset={() => {
                      fetchTarifOverrides();
                    }}
                    saving={savingTarifs === talent.id}
                    setSaving={(saving) =>
                      setSavingTarifs(saving ? talent.id : null)
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TalentTarifForm({
  talent,
  override,
  partnerId,
  onSave,
  onReset,
  saving,
  setSaving,
}: {
  talent: Talent;
  override?: TarifOverride;
  partnerId: string;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
}) {
  const [localOverrides, setLocalOverrides] = useState<{
    tarifStory?: number | null;
    tarifPost?: number | null;
    tarifReel?: number | null;
    tarifStoryConcours?: number | null;
    tarifPostConcours?: number | null;
    tarifTiktokVideo?: number | null;
    tarifYoutubeVideo?: number | null;
    tarifYoutubeShort?: number | null;
    tarifPostCommun?: number | null;
    tarifEvent?: number | null;
    tarifShooting?: number | null;
    tarifAmbassadeur?: number | null;
  }>({
    tarifStory: override?.tarifStory ?? null,
    tarifPost: override?.tarifPost ?? null,
    tarifReel: override?.tarifReel ?? null,
    tarifStoryConcours: override?.tarifStoryConcours ?? null,
    tarifPostConcours: override?.tarifPostConcours ?? null,
    tarifTiktokVideo: override?.tarifTiktokVideo ?? null,
    tarifYoutubeVideo: override?.tarifYoutubeVideo ?? null,
    tarifYoutubeShort: override?.tarifYoutubeShort ?? null,
    tarifPostCommun: override?.tarifPostCommun ?? null,
    tarifEvent: override?.tarifEvent ?? null,
    tarifShooting: override?.tarifShooting ?? null,
    tarifAmbassadeur: override?.tarifAmbassadeur ?? null,
  });
  const [note, setNote] = useState(override?.note || "");

  const defaultTarifs = talent.tarifs || {};

  const tarifFields = [
    { key: "tarifStory", label: "Story Instagram" },
    { key: "tarifPost", label: "Post Instagram" },
    { key: "tarifReel", label: "Reel Instagram" },
    { key: "tarifStoryConcours", label: "Story Concours" },
    { key: "tarifPostConcours", label: "Post Concours" },
    { key: "tarifTiktokVideo", label: "Vidéo TikTok" },
    { key: "tarifYoutubeVideo", label: "Vidéo YouTube" },
    { key: "tarifYoutubeShort", label: "YouTube Short" },
    { key: "tarifPostCommun", label: "Post Commun (UGC)" },
    { key: "tarifEvent", label: "Event / Apparition" },
    { key: "tarifShooting", label: "Shooting photo" },
    { key: "tarifAmbassadeur", label: "Pack Ambassadeur" },
  ] as const;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/tarifs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentId: talent.id,
          overrides: localOverrides,
          note: note || null,
        }),
      });

      if (res.ok) {
        onSave();
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de la sauvegarde");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Réinitialiser tous les tarifs négociés pour ce talent ?")) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/tarifs`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId: talent.id }),
      });

      if (res.ok) {
        setLocalOverrides({
          tarifStory: null,
          tarifPost: null,
          tarifReel: null,
          tarifStoryConcours: null,
          tarifPostConcours: null,
          tarifTiktokVideo: null,
          tarifYoutubeVideo: null,
          tarifYoutubeShort: null,
          tarifPostCommun: null,
          tarifEvent: null,
          tarifShooting: null,
          tarifAmbassadeur: null,
        });
        setNote("");
        onReset();
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de la réinitialisation");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la réinitialisation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 bg-gray-50 border-t">
      <div className="grid grid-cols-3 gap-4 mb-6">
        {tarifFields.map((field) => {
          const value = localOverrides[field.key];
          const defaultValue = defaultTarifs[field.key];
          const isModified =
            value !== null &&
            value !== undefined &&
            defaultValue !== null &&
            defaultValue !== undefined &&
            Number(value) !== Number(defaultValue);

          return (
            <div key={field.key}>
              <label className="block text-sm font-medium mb-1">
                {field.label}
              </label>
              <input
                type="number"
                step="0.01"
                value={value || ""}
                onChange={(e) =>
                  setLocalOverrides({
                    ...localOverrides,
                    [field.key]:
                      e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                className={`w-full px-3 py-2 border rounded-lg ${
                  isModified ? "border-blue-500 bg-blue-50" : ""
                }`}
                placeholder="Tarif négocié"
              />
              <p className="text-xs text-gray-500 mt-1">
                Défaut: {defaultValue ? `${Number(defaultValue).toFixed(0)} €` : "Non défini"}
              </p>
              {isModified && (
                <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                  modifié
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Note interne</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg"
          placeholder="Tarif négocié avec accord (partenaire) — ex. contrat annuel 2025"
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sauvegarde...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Sauvegarder
            </>
          )}
        </button>
      </div>
    </div>
  );
}
