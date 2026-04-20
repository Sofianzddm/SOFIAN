"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

type TalentOption = { id: string; name: string };
type Mission = {
  id: string;
  campaignId: string | null;
  campaignTitle: string | null;
  talentId: string | null;
  talentName: string | null;
  creatorName: string;
  targetBrand: string;
  strategyReason: string;
  recommendedAngle: string | null;
  objective: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "READY_FOR_CASTING" | "EMAIL_DRAFTED" | "APPROVED_BY_SALES" | "SENT" | "RELANCED" | "CANCELLED";
  createdAt: string;
};

type Campaign = {
  id: string;
  title: string;
  talentId: string;
  talentName: string;
  isActive: boolean;
  missionCount: number;
  responseRate: number;
};

const PRIORITY_LABEL: Record<Mission["priority"], string> = {
  LOW: "Basse",
  MEDIUM: "Moyenne",
  HIGH: "Haute",
  URGENT: "Urgente",
};

const STATUS_LABEL: Record<Mission["status"], string> = {
  READY_FOR_CASTING: "A rédiger",
  EMAIL_DRAFTED: "Brouillon en cours",
  APPROVED_BY_SALES: "Mail prêt",
  SENT: "Envoyé",
  RELANCED: "Relancé",
  CANCELLED: "Annulé",
};

export function ContactMissionsClient() {
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    talentId: "",
    description: "",
    targetBrand: "",
    strategyReason: "",
    recommendedAngle: "",
    objective: "",
    priority: "MEDIUM" as Mission["priority"],
  });

  async function loadTalents() {
    const res = await fetch("/api/talents?presskit=true", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Impossible de charger les talents.");
    const list = Array.isArray(data.talents) ? data.talents : [];
    setTalents(
      list.map((t: { id: string; name: string }) => ({
        id: String(t.id),
        name: String(t.name || ""),
      }))
    );
  }

  async function loadMissions() {
    const qp = selectedCampaignId ? `?campaignId=${encodeURIComponent(selectedCampaignId)}` : "";
    const res = await fetch(`/api/strategy/contact-missions${qp}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Impossible de charger les missions.");
    setMissions(Array.isArray(data.missions) ? (data.missions as Mission[]) : []);
  }

  async function loadCampaigns() {
    const res = await fetch("/api/strategy/prospecting-campaigns?active=1&mine=1", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Impossible de charger les campagnes.");
    const rows = Array.isArray(data.campaigns) ? (data.campaigns as Campaign[]) : [];
    setCampaigns(rows);
    if (!selectedCampaignId && rows[0]?.id) {
      setSelectedCampaignId(rows[0].id);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadTalents(), loadCampaigns(), loadMissions()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadMissions().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaignId]);

  async function onCreateCampaign(event: FormEvent) {
    event.preventDefault();
    setSavingCampaign(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/strategy/prospecting-campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Création campagne impossible.");
      const campaignId = data?.campaign?.id as string | undefined;
      if (!campaignId) throw new Error("Campagne créée mais id introuvable.");

      const talentName = talents.find((t) => t.id === campaignForm.talentId)?.name || "Talent";
      const missionRes = await fetch("/api/strategy/contact-missions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          talentId: campaignForm.talentId,
          creatorName: talentName,
          targetBrand: campaignForm.targetBrand,
          strategyReason: campaignForm.strategyReason,
          recommendedAngle: campaignForm.recommendedAngle || null,
          objective: campaignForm.objective || null,
          priority: campaignForm.priority,
        }),
      });
      const missionData = await missionRes.json().catch(() => ({}));
      if (!missionRes.ok) throw new Error(missionData.error || "Création carte impossible.");

      setCampaignForm({
        title: "",
        talentId: "",
        description: "",
        targetBrand: "",
        strategyReason: "",
        recommendedAngle: "",
        objective: "",
        priority: "MEDIUM",
      });
      setSelectedCampaignId(campaignId);
      setSuccess("Campagne créée et carte ajoutée directement.");
      await Promise.all([loadCampaigns(), loadMissions()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function updateMissionStatus(missionId: string, status: Mission["status"]) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/strategy/contact-missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise à jour statut impossible.");
      setSuccess("Statut mission mis à jour.");
      await loadMissions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-6 md:p-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Stratégies de contact talents</h1>
            <p className="mt-1 text-sm text-gray-500">
              Campagne de prospection talent : plan stratégique + pipeline partagé.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Module unique campagne + cartes</h2>
          <a href="/strategy/projet-individuel-talent/pipeline" className="text-xs text-gray-600 underline">
            Ouvrir pipeline partage
          </a>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <form onSubmit={onCreateCampaign} className="rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Créer campagne (carte directe)</h3>
            <input
              value={campaignForm.title}
              onChange={(e) => setCampaignForm((v) => ({ ...v, title: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Q2 2026 - Melissa Alleb - Beaute haut de gamme"
              required
            />
            <select
              value={campaignForm.talentId}
              onChange={(e) => setCampaignForm((v) => ({ ...v, talentId: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Choisir un talent</option>
              {talents.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <textarea
              value={campaignForm.description}
              onChange={(e) => setCampaignForm((v) => ({ ...v, description: e.target.value }))}
              className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Contexte et intention globale"
            />
            <input
              value={campaignForm.targetBrand}
              onChange={(e) => setCampaignForm((v) => ({ ...v, targetBrand: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Marque a contacter"
              required
            />
            <textarea
              value={campaignForm.strategyReason}
              onChange={(e) => setCampaignForm((v) => ({ ...v, strategyReason: e.target.value }))}
              className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Pourquoi cette marque pour ce talent ?"
              required
            />
            <input
              value={campaignForm.recommendedAngle}
              onChange={(e) => setCampaignForm((v) => ({ ...v, recommendedAngle: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Angle recommande"
            />
            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={campaignForm.objective}
                onChange={(e) => setCampaignForm((v) => ({ ...v, objective: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Objectif"
              />
              <select
                value={campaignForm.priority}
                onChange={(e) =>
                  setCampaignForm((v) => ({ ...v, priority: e.target.value as Mission["priority"] }))
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="LOW">Priorité basse</option>
                <option value="MEDIUM">Priorité moyenne</option>
                <option value="HIGH">Priorité haute</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={savingCampaign}
              className="rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {savingCampaign ? "Creation..." : "Creer campagne + carte"}
            </button>
          </form>

          <div className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-900">Mes campagnes actives</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCampaignId(c.id)}
                  className={`rounded-lg border p-3 text-left ${
                    selectedCampaignId === c.id ? "border-[#1A1110] bg-gray-50" : "border-gray-200"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{c.title}</p>
                  <p className="text-xs text-gray-600">{c.talentName}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {c.missionCount} cartes · taux reponse: {c.responseRate}%
                  </p>
                </button>
              ))}
              {!loading && campaigns.length === 0 && (
                <p className="text-sm text-gray-500">Aucune campagne active.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Cartes de la campagne</h2>
        <div className="mt-3 space-y-2 max-h-[70vh] overflow-auto">
          {missions.map((m) => (
            <article key={m.id} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900">
                {m.creatorName} → {m.targetBrand}
              </p>
              <p className="mt-1 text-xs text-gray-600">{m.strategyReason}</p>
              <p className="mt-1 text-[11px] text-gray-500">
                Campagne: {m.campaignTitle || "—"} · Priorité: {PRIORITY_LABEL[m.priority]} · Statut:{" "}
                {STATUS_LABEL[m.status]}
              </p>
              {m.status !== "SENT" && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => void updateMissionStatus(m.id, "SENT")}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                  >
                    Marquer envoyé
                  </button>
                </div>
              )}
            </article>
          ))}
          {!loading && missions.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune carte pour cette campagne.</p>
          ) : null}
        </div>
      </section>

      {loading && (
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement...
        </div>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </main>
  );
}
