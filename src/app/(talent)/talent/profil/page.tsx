"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { UserRound, Loader2, Save, Check, MapPin, Sparkles } from "lucide-react";
import {
  TYPE_PEAU_OPTIONS,
  TYPE_CHEVEUX_OPTIONS,
  COULEUR_CHEVEUX_OPTIONS,
  TENDANCE_PEAU_OPTIONS,
  TENDANCE_CHEVEUX_OPTIONS,
  ANIMAUX_OPTIONS,
  AGES_ENFANTS_OPTIONS,
  SPORTS_OPTIONS,
  MOBILITE_OPTIONS,
} from "@/lib/talent-attributes";

interface ProfilData {
  prenom: string;
  nom: string;
  ville: string;
  typePeau: string;
  typeCheveux: string;
  couleurCheveux: string;
  tendancePeau: string[];
  tendanceCheveux: string[];
  animaux: string[];
  nombreEnfants: string;
  agesEnfants: string[];
  enceinte: boolean;
  sports: string[];
  mobilite: string[];
}

const EMPTY: ProfilData = {
  prenom: "",
  nom: "",
  ville: "",
  typePeau: "",
  typeCheveux: "",
  couleurCheveux: "",
  tendancePeau: [],
  tendanceCheveux: [],
  animaux: [],
  nombreEnfants: "",
  agesEnfants: [],
  enceinte: false,
  sports: [],
  mobilite: [],
};

export default function TalentProfilPage() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const [form, setForm] = useState<ProfilData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/talents/me/profile");
        if (res.ok) {
          const data = await res.json();
          setForm({
            prenom: data.prenom || "",
            nom: data.nom || "",
            ville: data.ville || "",
            typePeau: data.typePeau || "",
            typeCheveux: data.typeCheveux || "",
            couleurCheveux: data.couleurCheveux || "",
            tendancePeau: data.tendancePeau || [],
            tendanceCheveux: data.tendanceCheveux || [],
            animaux: data.animaux || [],
            nombreEnfants:
              data.nombreEnfants !== null && data.nombreEnfants !== undefined
                ? String(data.nombreEnfants)
                : "",
            agesEnfants: data.agesEnfants || [],
            enceinte: Boolean(data.enceinte),
            sports: data.sports || [],
            mobilite: data.mobilite || [],
          });
        }
      } catch (error) {
        console.error("Erreur chargement profil:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const toggleTendance = (
    field:
      | "tendancePeau"
      | "tendanceCheveux"
      | "animaux"
      | "agesEnfants"
      | "sports"
      | "mobilite",
    opt: string
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(opt)
        ? prev[field].filter((x) => x !== opt)
        : [...prev[field], opt],
    }));
    setSaved(false);
  };

  async function handleSave() {
    if (isDemo) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/talents/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ville: form.ville,
          typePeau: form.typePeau,
          typeCheveux: form.typeCheveux,
          couleurCheveux: form.couleurCheveux,
          tendancePeau: form.tendancePeau,
          tendanceCheveux: form.tendanceCheveux,
          animaux: form.animaux,
          nombreEnfants: form.nombreEnfants,
          agesEnfants: form.agesEnfants,
          enceinte: form.enceinte,
          sports: form.sports,
          mobilite: form.mobilite,
        }),
      });
      if (res.ok) {
        setSaved(true);
      } else {
        const error = await res.json().catch(() => null);
        alert(`Erreur : ${error?.error || "Impossible d'enregistrer"}`);
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur de connexion lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const selectClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-glowup-rose focus:border-transparent appearance-none";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-glowup-licorice flex items-center gap-3">
          <UserRound className="w-8 h-8" />
          Mon Profil
        </h1>
        <p className="text-gray-600 mt-1">
          Ces infos aident tes managers à te proposer aux bonnes marques
        </p>
        {isDemo && (
          <p className="mt-2 inline-flex rounded-md bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
            Mode démo — l'enregistrement est désactivé
          </p>
        )}
      </div>

      {/* Identité (lecture seule) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-500">Talent</p>
        <p className="text-xl font-semibold text-glowup-licorice">
          {form.prenom} {form.nom}
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Pour modifier ton nom, ton email ou tes tarifs, contacte ton Talent
          Manager.
        </p>
      </div>

      {/* Localisation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-blue-50 rounded-lg">
            <MapPin className="w-5 h-5 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-glowup-licorice">
            Localisation
          </h2>
        </div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Ville
        </label>
        <input
          type="text"
          name="ville"
          value={form.ville}
          onChange={handleChange}
          placeholder="Paris"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
        />
      </div>

      {/* Apparence */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-pink-50 rounded-lg">
            <Sparkles className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-glowup-licorice">
              Apparence
            </h2>
            <p className="text-xs text-gray-500">
              Souvent demandé par les marques beauté
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type de peau
            </label>
            <select
              name="typePeau"
              value={form.typePeau}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Non renseigné</option>
              {TYPE_PEAU_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type de cheveux
            </label>
            <select
              name="typeCheveux"
              value={form.typeCheveux}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Non renseigné</option>
              {TYPE_CHEVEUX_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Couleur de cheveux
            </label>
            <select
              name="couleurCheveux"
              value={form.couleurCheveux}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Non renseigné</option>
              {COULEUR_CHEVEUX_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tendance de peau{" "}
            <span className="text-gray-400 font-normal">
              (plusieurs choix possibles)
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TENDANCE_PEAU_OPTIONS.map((opt) => {
              const active = form.tendancePeau.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleTendance("tendancePeau", opt)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    active
                      ? "bg-glowup-rose text-white border-glowup-rose"
                      : "bg-white text-gray-600 border-gray-300 hover:border-glowup-rose"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tendance des cheveux{" "}
            <span className="text-gray-400 font-normal">
              (plusieurs choix possibles)
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TENDANCE_CHEVEUX_OPTIONS.map((opt) => {
              const active = form.tendanceCheveux.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleTendance("tendanceCheveux", opt)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    active
                      ? "bg-glowup-rose text-white border-glowup-rose"
                      : "bg-white text-gray-600 border-gray-300 hover:border-glowup-rose"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Profil / Lifestyle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <Sparkles className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-glowup-licorice">
              Profil / Lifestyle
            </h2>
            <p className="text-xs text-gray-500">
              Aide les marques à te proposer les bonnes campagnes (gifting inclus)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nombre d&apos;enfants
            </label>
            <select
              name="nombreEnfants"
              value={form.nombreEnfants}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Non renseigné</option>
              {["0", "1", "2", "3", "4", "5"].map((n) => (
                <option key={n} value={n}>
                  {n === "5" ? "5+" : n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer select-none py-2.5">
              <input
                type="checkbox"
                checked={form.enceinte}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, enceinte: e.target.checked }));
                  setSaved(false);
                }}
                className="w-4 h-4 rounded border-gray-300 text-glowup-rose focus:ring-glowup-rose"
              />
              <span className="text-sm font-medium text-gray-700">
                Enceinte / grossesse en cours
              </span>
            </label>
          </div>
        </div>

        {[
          { key: "agesEnfants" as const, label: "Âge des enfants", options: AGES_ENFANTS_OPTIONS },
          { key: "animaux" as const, label: "Animaux", options: ANIMAUX_OPTIONS },
          { key: "sports" as const, label: "Sports & activités", options: SPORTS_OPTIONS },
          { key: "mobilite" as const, label: "Mobilité", options: MOBILITE_OPTIONS },
        ].map((group) => (
          <div key={group.key} className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {group.label}{" "}
              <span className="text-gray-400 font-normal">
                (plusieurs choix possibles)
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {group.options.map((opt) => {
                const active = form[group.key].includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleTendance(group.key, opt)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      active
                        ? "bg-glowup-rose text-white border-glowup-rose"
                        : "bg-white text-gray-600 border-gray-300 hover:border-glowup-rose"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || isDemo}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-glowup-licorice text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Enregistrer
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
            <Check className="w-4 h-4" />
            Enregistré
          </span>
        )}
      </div>
    </div>
  );
}
