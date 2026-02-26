"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ChevronLeft, RefreshCw } from "lucide-react";
import { formatBlocTalents, BLOC_EMOJIS, formatFollowers, type BlocFormat } from "@/lib/presskit-bloc";

type TalentBloc = {
  id: string;
  pressKitTalentId: string;
  prenom: string;
  name: string;
  pitch: string;
  instagram: string | null;
  followers: number;
  igFollowersEvol: number | null;
  ttFollowers: number;
  ttFollowersEvol: number | null;
  ytAbonnes?: number | null;
};

type BrandData = {
  brandId: string;
  slug: string;
  name: string;
  talents: TalentBloc[];
};

export default function PressKitBrandBlocPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<BrandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPitches, setEditingPitches] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [usePlainText, setUsePlainText] = useState(false);

  const fetchBrand = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/presskit/${slug}`);
      if (!res.ok) {
        if (res.status === 404) setError("Press kit introuvable. Générez d'abord le press kit (Preview) pour cette marque.");
        else setError("Erreur chargement");
        setData(null);
        return;
      }
      const json = await res.json();
      setData({
        brandId: json.brandId,
        slug: json.slug,
        name: json.name,
        talents: (json.talents || []).map((t: any) => ({
          id: t.id,
          pressKitTalentId: t.pressKitTalentId,
          prenom: t.prenom,
          name: t.name,
          pitch: t.pitch || "",
          instagram: t.instagram ?? null,
          followers: t.followers ?? 0,
          igFollowersEvol: t.igFollowersEvol,
          ttFollowers: t.ttFollowers ?? 0,
          ttFollowersEvol: t.ttFollowersEvol,
          ytAbonnes: t.ytAbonnes ?? 0,
        })),
      });
      setEditingPitches({});
    } catch {
      setError("Erreur réseau");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug) fetchBrand();
  }, [slug, fetchBrand]);

  const handlePitchBlur = async (pressKitTalentId: string, value: string) => {
    const current = data?.talents.find((t) => t.pressKitTalentId === pressKitTalentId)?.pitch ?? "";
    if (value.trim() === current) return;
    setSavingId(pressKitTalentId);
    try {
      const res = await fetch("/api/presskit/update-pitch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pressKitTalentId, pitch: value.trim() }),
      });
      if (res.ok && data) {
        setData({
          ...data,
          talents: data.talents.map((t) =>
            t.pressKitTalentId === pressKitTalentId ? { ...t, pitch: value.trim() } : t
          ),
        });
        setEditingPitches((prev) => {
          const next = { ...prev };
          delete next[pressKitTalentId];
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingId(null);
    }
  };

  const handleRegenerateOne = async (talentId: string) => {
    if (!data) return;
    setRegeneratingId(talentId);
    try {
      const res = await fetch("/api/presskit/generate-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: data.brandId, talentId }),
      });
      const json = await res.json();
      if (res.ok && json.pitch) {
        setData({
          ...data,
          talents: data.talents.map((t) =>
            t.id === talentId ? { ...t, pitch: json.pitch } : t
          ),
        });
        setEditingPitches((prev) => {
          const next = { ...prev };
          delete next[data.talents.find((t) => t.id === talentId)!.pressKitTalentId];
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRegenerateAll = async () => {
    if (!data) return;
    setRegeneratingAll(true);
    try {
      const res = await fetch("/api/presskit/generate-all-pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: data.brandId }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.pitches)) {
        setData({
          ...data,
          talents: data.talents.map((t, i) => ({ ...t, pitch: json.pitches[i] ?? t.pitch })),
        });
        setEditingPitches({});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRegeneratingAll(false);
    }
  };

  const blocFormat: BlocFormat = usePlainText ? "plain" : "html";
  const previewText = data
    ? formatBlocTalents(
        data.talents.map((t) => ({
          prenom: t.prenom,
          pitch: editingPitches[t.pressKitTalentId] ?? t.pitch,
          instagramHandle: t.instagram?.replace(/^@/, "").trim() || null,
          igFollowers: t.followers,
          ttFollowers: t.ttFollowers,
          ytAbonnes: t.ytAbonnes,
        })),
        blocFormat
      )
    : "";

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-blue-600 hover:underline mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Retour Press Kit
        </button>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-amber-800">
          <p className="font-medium">{error || "Données introuvables"}</p>
          <p className="text-sm mt-2">
            Utilisez d'abord « Preview » ou « Générer les press kits » pour créer cette marque, puis revenez ici.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-blue-600 hover:underline mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> Retour Press Kit
      </button>

      <h1 className="text-2xl font-bold mb-2">Bloc Email — {data.name}</h1>
      <p className="text-gray-600 mb-6">
        Ce bloc sera injecté dans la variable <code className="bg-gray-100 px-1 rounded">{"{{bloc_talents}}"}</code> sur HubSpot (propriété Rich text).
      </p>

      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={usePlainText}
            onChange={(e) => setUsePlainText(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Format texte brut</span>
        </label>
        <button
          type="button"
          onClick={handleRegenerateAll}
          disabled={regeneratingAll}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {regeneratingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Régénérer tout
        </button>
      </div>

      <section className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Bloc Email (éditable)</h2>
        <div className="space-y-4">
          {data.talents.map((talent, index) => {
            const emoji = BLOC_EMOJIS[index % BLOC_EMOJIS.length];
            const pitchValue = editingPitches[talent.pressKitTalentId] ?? talent.pitch;
            const parts: string[] = [];
            if (talent.followers > 0) parts.push(`${formatFollowers(talent.followers)} sur Instagram`);
            if (talent.ttFollowers > 0) parts.push(`${formatFollowers(talent.ttFollowers)} sur TikTok`);
            if (Number(talent.ytAbonnes ?? 0) > 0) parts.push(`${formatFollowers(Number(talent.ytAbonnes))} sur YouTube`);
            const statsStr = parts.join(" · ");

            return (
              <div key={talent.id} className="border rounded-lg p-4 bg-gray-50/50">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-medium text-gray-700">
                    {emoji} {talent.prenom} — {statsStr || "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRegenerateOne(talent.id)}
                    disabled={regeneratingId === talent.id}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {regeneratingId === talent.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Régénérer
                  </button>
                </div>
                <textarea
                  value={pitchValue}
                  onChange={(e) =>
                    setEditingPitches((prev) => ({
                      ...prev,
                      [talent.pressKitTalentId]: e.target.value,
                    }))
                  }
                  onBlur={(e) => handlePitchBlur(talent.pressKitTalentId, e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm min-h-[60px]"
                  placeholder="Pitch (phrase de vente)..."
                />
                {savingId === talent.pressKitTalentId && (
                  <p className="text-xs text-gray-500 mt-1">Enregistrement…</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Aperçu (texte envoyé à HubSpot)</h2>
        <p className="text-sm text-gray-500 mb-2">
          Ce que le contact verra dans le mail (variable {"{{bloc_talents}}"}).
          {usePlainText && " — Format texte brut activé."}
        </p>
        {blocFormat === "html" ? (
          <div
            className="bg-gray-50 border rounded-lg p-4 text-sm prose prose-sm max-w-none [&_a]:text-[#E1306C] [&_a]:underline [&_a]:font-bold"
            dangerouslySetInnerHTML={{
              __html: previewText
                ? previewText.split("\n\n").map((line) => `<p class="mb-2 last:mb-0">${line}</p>`).join("")
                : "<p class='text-gray-500'>(Aucun pitch)</p>",
            }}
          />
        ) : (
          <pre className="bg-gray-50 border rounded-lg p-4 text-sm whitespace-pre-wrap font-sans">
            {previewText || "(Aucun pitch)"}
          </pre>
        )}
      </section>

      <p className="text-sm text-gray-500 mt-4">
        Le bloc et le lien presskit sont poussés automatiquement sur les contacts HubSpot lors de la génération (étape 5 du flow).
      </p>
    </div>
  );
}
