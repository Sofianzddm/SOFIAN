"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Instagram,
  Music2,
  Youtube,
  Loader2,
  Save,
  AlertCircle,
  Calendar,
  Users,
  Globe,
} from "lucide-react";

const numToString = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

interface TalentStats {
  igFollowers: number | null;
  igFollowersEvol: number | null;
  igEngagement: number | null;
  igEngagementEvol: number | null;
  igGenreFemme: number | null;
  igGenreHomme: number | null;
  igAge13_17: number | null;
  igAge18_24: number | null;
  igAge25_34: number | null;
  igAge35_44: number | null;
  igAge45Plus: number | null;
  igLocFrance: number | null;
  ttFollowers: number | null;
  ttFollowersEvol: number | null;
  ttEngagement: number | null;
  ttEngagementEvol: number | null;
  ttGenreFemme: number | null;
  ttGenreHomme: number | null;
  ttAge13_17: number | null;
  ttAge18_24: number | null;
  ttAge25_34: number | null;
  ttAge35_44: number | null;
  ttAge45Plus: number | null;
  ttLocFrance: number | null;
  ytAbonnes: number | null;
  ytAbonnesEvol: number | null;
  lastUpdate: string | null;
}

interface TalentDetail {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  managerId: string;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  stats: TalentStats | null;
}

const EMPTY_FORM = {
  igFollowers: "",
  igFollowersEvol: "",
  igEngagement: "",
  igEngagementEvol: "",
  igGenreFemme: "",
  igGenreHomme: "",
  igAge13_17: "",
  igAge18_24: "",
  igAge25_34: "",
  igAge35_44: "",
  igAge45Plus: "",
  igLocFrance: "",
  ttFollowers: "",
  ttFollowersEvol: "",
  ttEngagement: "",
  ttEngagementEvol: "",
  ttGenreFemme: "",
  ttGenreHomme: "",
  ttAge13_17: "",
  ttAge18_24: "",
  ttAge25_34: "",
  ttAge35_44: "",
  ttAge45Plus: "",
  ttLocFrance: "",
  ytAbonnes: "",
  ytAbonnesEvol: "",
};

type StatsForm = typeof EMPTY_FORM;

export default function TalentStatsEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const talentId = params?.id;
  const { data: session, status } = useSession();

  const [talent, setTalent] = useState<TalentDetail | null>(null);
  const [formData, setFormData] = useState<StatsForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user as { id: string; role: string } | undefined;
  const role = user?.role || "";
  const userId = user?.id || "";

  const isAuthorized =
    role === "ADMIN" ||
    role === "HEAD_OF" ||
    role === "HEAD_OF_INFLUENCE" ||
    (role === "TM" && talent?.managerId === userId);

  useEffect(() => {
    if (!talentId) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/talents/${talentId}`);
        if (!res.ok) throw new Error("Talent introuvable");
        const data: TalentDetail = await res.json();
        setTalent(data);
        const stats = data.stats || ({} as Partial<TalentStats>);
        setFormData({
          igFollowers: numToString(stats.igFollowers),
          igFollowersEvol: numToString(stats.igFollowersEvol),
          igEngagement: numToString(stats.igEngagement),
          igEngagementEvol: numToString(stats.igEngagementEvol),
          igGenreFemme: numToString(stats.igGenreFemme),
          igGenreHomme: numToString(stats.igGenreHomme),
          igAge13_17: numToString(stats.igAge13_17),
          igAge18_24: numToString(stats.igAge18_24),
          igAge25_34: numToString(stats.igAge25_34),
          igAge35_44: numToString(stats.igAge35_44),
          igAge45Plus: numToString(stats.igAge45Plus),
          igLocFrance: numToString(stats.igLocFrance),
          ttFollowers: numToString(stats.ttFollowers),
          ttFollowersEvol: numToString(stats.ttFollowersEvol),
          ttEngagement: numToString(stats.ttEngagement),
          ttEngagementEvol: numToString(stats.ttEngagementEvol),
          ttGenreFemme: numToString(stats.ttGenreFemme),
          ttGenreHomme: numToString(stats.ttGenreHomme),
          ttAge13_17: numToString(stats.ttAge13_17),
          ttAge18_24: numToString(stats.ttAge18_24),
          ttAge25_34: numToString(stats.ttAge25_34),
          ttAge35_44: numToString(stats.ttAge35_44),
          ttAge45Plus: numToString(stats.ttAge45Plus),
          ttLocFrance: numToString(stats.ttLocFrance),
          ytAbonnes: numToString(stats.ytAbonnes),
          ytAbonnesEvol: numToString(stats.ytAbonnesEvol),
        });
      } catch (e) {
        console.error("Erreur chargement talent:", e);
        setError("Erreur lors du chargement du talent");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [talentId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!talentId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/talents/${talentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur lors de l'enregistrement");
      }
      router.push(`/talents/${talentId}`);
    } catch (e: any) {
      setError(e?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (!talent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50/50">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-gray-600">Talent introuvable</p>
        <Link href="/talents" className="text-glowup-rose hover:underline">
          ← Retour à la liste
        </Link>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50/50">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <p className="text-gray-700 font-medium">Accès non autorisé</p>
        <p className="text-gray-500 text-sm">
          Vous ne pouvez modifier les stats que de vos propres talents.
        </p>
        <Link
          href={`/talents/${talent.id}`}
          className="text-glowup-rose hover:underline"
        >
          ← Retour à la fiche
        </Link>
      </div>
    );
  }

  const lastUpdateLabel = talent.stats?.lastUpdate
    ? new Date(talent.stats.lastUpdate).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href={`/talents/${talent.id}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </Link>
              <div className="flex items-center gap-3 min-w-0">
                {talent.photo ? (
                  <img
                    src={talent.photo}
                    alt={talent.prenom}
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-glowup-lace flex items-center justify-center flex-shrink-0">
                    <span className="text-glowup-rose font-bold">
                      {talent.prenom.charAt(0)}
                      {talent.nom.charAt(0)}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-glowup-licorice truncate">
                    Mettre à jour les stats
                  </h1>
                  <p className="text-sm text-gray-500 truncate">
                    {talent.prenom} {talent.nom}
                    {lastUpdateLabel && (
                      <span className="ml-2 text-xs text-gray-400">
                        · Dernière maj : {lastUpdateLabel}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark transition-all shadow-sm shadow-glowup-rose/25 disabled:opacity-50 flex-shrink-0"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Enregistrer
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <BarChart3 className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Mettez à jour les statistiques des réseaux sociaux
            </p>
            <p className="text-xs text-amber-700">
              Renseignez uniquement les champs que vous souhaitez modifier. Les
              champs laissés vides ne changent pas la valeur enregistrée.
            </p>
          </div>
        </div>

        {/* Instagram */}
        {talent.instagram && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-glowup-licorice">
                  Statistiques Instagram
                </h2>
                <p className="text-xs text-gray-500">@{talent.instagram}</p>
              </div>
            </div>

            {/* Followers & Engagement */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <NumberCard
                label="Followers"
                name="igFollowers"
                value={formData.igFollowers}
                onChange={handleChange}
                placeholder="102000"
              />
              <EvolCard
                label="Évolution"
                name="igFollowersEvol"
                value={formData.igFollowersEvol}
                onChange={handleChange}
                placeholder="0.68"
                suffix="%"
              />
              <NumberCard
                label="Engagement"
                name="igEngagement"
                value={formData.igEngagement}
                onChange={handleChange}
                placeholder="6.12"
                step="0.01"
                suffix="%"
              />
              <EvolCard
                label="Évol. engagement"
                name="igEngagementEvol"
                value={formData.igEngagementEvol}
                onChange={handleChange}
                placeholder="1.92"
                suffix="pts"
              />
            </div>

            {/* Démographie */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <PercentInput
                icon={<Users className="w-4 h-4 text-pink-500" />}
                label="Femmes"
                name="igGenreFemme"
                value={formData.igGenreFemme}
                onChange={handleChange}
                placeholder="78"
              />
              <PercentInput
                icon={<Users className="w-4 h-4 text-blue-500" />}
                label="Hommes"
                name="igGenreHomme"
                value={formData.igGenreHomme}
                onChange={handleChange}
                placeholder="21"
              />
              <PercentInput
                icon={<Globe className="w-4 h-4 text-emerald-500" />}
                label="Audience FR"
                name="igLocFrance"
                value={formData.igLocFrance}
                onChange={handleChange}
                placeholder="84"
              />
            </div>

            <AgeGrid
              icon={<Calendar className="w-4 h-4 text-gray-400" />}
              label="Tranches d'âge"
              fields={[
                { name: "igAge13_17", label: "13-17" },
                { name: "igAge18_24", label: "18-24" },
                { name: "igAge25_34", label: "25-34" },
                { name: "igAge35_44", label: "35-44" },
                { name: "igAge45Plus", label: "45+" },
              ]}
              formData={formData}
              onChange={handleChange}
              focusColor="focus:border-pink-500"
            />
          </section>
        )}

        {/* TikTok */}
        {talent.tiktok && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black rounded-lg">
                <Music2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-glowup-licorice">
                  Statistiques TikTok
                </h2>
                <p className="text-xs text-gray-500">@{talent.tiktok}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <NumberCard
                label="Followers"
                name="ttFollowers"
                value={formData.ttFollowers}
                onChange={handleChange}
                placeholder="363000"
              />
              <EvolCard
                label="Évolution"
                name="ttFollowersEvol"
                value={formData.ttFollowersEvol}
                onChange={handleChange}
                placeholder="0.8"
                suffix="%"
              />
              <NumberCard
                label="Engagement"
                name="ttEngagement"
                value={formData.ttEngagement}
                onChange={handleChange}
                placeholder="4.91"
                step="0.01"
                suffix="%"
              />
              <EvolCard
                label="Évol. engagement"
                name="ttEngagementEvol"
                value={formData.ttEngagementEvol}
                onChange={handleChange}
                placeholder="2.12"
                suffix="pts"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <PercentInput
                icon={<Users className="w-4 h-4 text-pink-500" />}
                label="Femmes"
                name="ttGenreFemme"
                value={formData.ttGenreFemme}
                onChange={handleChange}
                placeholder="74"
              />
              <PercentInput
                icon={<Users className="w-4 h-4 text-blue-500" />}
                label="Hommes"
                name="ttGenreHomme"
                value={formData.ttGenreHomme}
                onChange={handleChange}
                placeholder="25"
              />
              <PercentInput
                icon={<Globe className="w-4 h-4 text-emerald-500" />}
                label="Audience FR"
                name="ttLocFrance"
                value={formData.ttLocFrance}
                onChange={handleChange}
                placeholder="82"
              />
            </div>

            <AgeGrid
              icon={<Calendar className="w-4 h-4 text-gray-400" />}
              label="Tranches d'âge"
              fields={[
                { name: "ttAge13_17", label: "13-17" },
                { name: "ttAge18_24", label: "18-24" },
                { name: "ttAge25_34", label: "25-34" },
                { name: "ttAge35_44", label: "35-44" },
                { name: "ttAge45Plus", label: "45+" },
              ]}
              formData={formData}
              onChange={handleChange}
              focusColor="focus:border-gray-800"
            />
          </section>
        )}

        {/* YouTube */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-red-500 rounded-lg">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-glowup-licorice">
                Statistiques YouTube
              </h2>
              {talent.youtube && (
                <p className="text-xs text-gray-500 truncate">{talent.youtube}</p>
              )}
            </div>
            <span className="text-xs text-gray-400">Optionnel</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberCard
              label="Abonnés"
              name="ytAbonnes"
              value={formData.ytAbonnes}
              onChange={handleChange}
              placeholder="50000"
            />
            <EvolCard
              label="Évolution"
              name="ytAbonnesEvol"
              value={formData.ytAbonnesEvol}
              onChange={handleChange}
              placeholder="1.5"
              suffix="%"
            />
          </div>
        </section>

        {/* Footer action */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`/talents/${talent.id}`}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Annuler
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark transition-all shadow-lg shadow-glowup-rose/25 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Enregistrer les stats
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ */
/* Sub-components               */
/* ============================ */

function NumberCard({
  label,
  name,
  value,
  onChange,
  placeholder,
  step,
  suffix,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  step?: string;
  suffix?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          name={name}
          value={value}
          onChange={onChange}
          step={step}
          placeholder={placeholder}
          className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none"
        />
        {suffix && <span className="text-gray-400 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

function EvolCard({
  label,
  name,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          name={name}
          value={value}
          onChange={onChange}
          step="0.01"
          placeholder={placeholder}
          className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none"
        />
        {suffix && <span className="text-emerald-500 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

function PercentInput({
  icon,
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm text-gray-600 mb-1.5">
        {icon}
        {label} (%)
      </label>
      <input
        type="number"
        name={name}
        value={value}
        onChange={onChange}
        step="0.01"
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
      />
    </div>
  );
}

function AgeGrid({
  icon,
  label,
  fields,
  formData,
  onChange,
  focusColor,
}: {
  icon: React.ReactNode;
  label: string;
  fields: { name: keyof StatsForm; label: string }[];
  formData: StatsForm;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  focusColor: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-3">
        {icon}
        {label}
      </label>
      <div className="grid grid-cols-5 gap-2">
        {fields.map((age) => (
          <div key={age.name} className="text-center">
            <label className="block text-xs text-gray-500 mb-1">
              {age.label}
            </label>
            <input
              type="number"
              name={age.name}
              value={formData[age.name]}
              onChange={onChange}
              step="0.01"
              placeholder="%"
              className={`w-full px-2 py-2 text-center rounded-lg border border-gray-200 focus:outline-none ${focusColor} text-sm`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
