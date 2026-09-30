"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { brandsLookSame } from "@/lib/brand-match";

type TalentOption = { id: string; name: string };
type MarqueHit = { id: string; nom: string; ville: string; contactCount: number };
type BrandHistoryHit = {
  marqueId: string | null;
  targetBrand: string;
  targetBrandKey: string;
  sentAt: string;
  daysAgo: number;
  daysLeft: number;
  blocked: boolean;
  missionId: string;
  viaTalent?: string | null;
  source?: "talent" | "wave";
};
type Mission = {
  id: string;
  campaignId: string | null;
  campaignTitle: string | null;
  talentId: string | null;
  talentName: string | null;
  creatorName: string;
  targetBrand: string;
  marqueId?: string | null;
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

function formatFrDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function findHistoryForBrand(
  history: BrandHistoryHit[],
  opts: { marqueId?: string | null; nom: string }
): BrandHistoryHit | null {
  const mid = String(opts.marqueId || "").trim();
  if (mid) {
    const byId = history.find((h) => h.marqueId === mid);
    if (byId) return byId;
  }
  const nom = opts.nom.trim();
  if (!nom) return null;
  return (
    history.find(
      (h) => brandsLookSame(nom, h.targetBrand) || brandsLookSame(nom, h.targetBrandKey)
    ) || null
  );
}

export function ContactMissionsClient() {
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [crm, setCrm] = useState<MarqueHit[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmFilter, setCrmFilter] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [brandHistory, setBrandHistory] = useState<BrandHistoryHit[]>([]);
  const [recontactDays, setRecontactDays] = useState(20);
  const [loading, setLoading] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingBrandId, setSavingBrandId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    talentId: "",
    description: "",
  });
  const [brandForm, setBrandForm] = useState({
    strategyReason: "",
    recommendedAngle: "",
    priority: "MEDIUM" as Mission["priority"],
  });

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) || null;

  const alreadyIds = useMemo(
    () => new Set(missions.map((m) => m.marqueId).filter(Boolean) as string[]),
    [missions]
  );
  const alreadyNames = useMemo(
    () =>
      new Set(missions.map((m) => String(m.targetBrand || "").trim().toLowerCase()).filter(Boolean)),
    [missions]
  );

  const filteredCrm = useMemo(() => {
    const q = crmFilter.trim().toLowerCase();
    if (!q) return crm;
    return crm.filter(
      (m) =>
        m.nom.toLowerCase().includes(q) ||
        (m.ville || "").toLowerCase().includes(q)
    );
  }, [crm, crmFilter]);

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

  async function loadCrm() {
    setCrmLoading(true);
    try {
      const res = await fetch("/api/marques/search", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger le CRM.");
      setCrm(Array.isArray(data.marques) ? (data.marques as MarqueHit[]) : []);
    } finally {
      setCrmLoading(false);
    }
  }

  async function loadBrandHistory(talentId: string) {
    const tid = String(talentId || "").trim();
    if (!tid) {
      setBrandHistory([]);
      return;
    }
    const res = await fetch(
      `/api/strategy/contact-missions/talent-brand-history?talentId=${encodeURIComponent(tid)}`,
      { credentials: "include" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Impossible de charger l'historique marques.");
    const talentHits = Array.isArray(data.history)
      ? (data.history as BrandHistoryHit[])
      : [];
    const waveHits = Array.isArray(data.brandWave)
      ? (data.brandWave as BrandHistoryHit[]).filter(
          // Ne pas doubler une marque déjà listée pour CE talent
          (w) =>
            !findHistoryForBrand(talentHits, {
              marqueId: w.marqueId,
              nom: w.targetBrand,
            })
        )
      : [];
    setBrandHistory([...talentHits, ...waveHits]);
    if (typeof data.recontactDays === "number") setRecontactDays(data.recontactDays);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadTalents(), loadCampaigns(), loadCrm()]);
      if (selectedCampaignId) await loadMissions();
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

  useEffect(() => {
    const talentId = selectedCampaign?.talentId;
    if (!talentId) {
      setBrandHistory([]);
      return;
    }
    void loadBrandHistory(talentId).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Erreur historique.");
    });
  }, [selectedCampaign?.talentId]);

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

      setCampaignForm({ title: "", talentId: "", description: "" });
      setSelectedCampaignId(campaignId);
      setSuccess("Campagne créée — ajoute les marques depuis le CRM.");
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function addBrand(opts: {
    targetBrand: string;
    marqueId?: string | null;
    savingKey: string;
  }) {
    if (!selectedCampaign) {
      setError("Sélectionne d’abord une campagne.");
      return;
    }
    const brand = opts.targetBrand.trim();
    if (!brand && !opts.marqueId) {
      setError("Marque requise.");
      return;
    }
    if (
      (opts.marqueId && alreadyIds.has(opts.marqueId)) ||
      alreadyNames.has(brand.toLowerCase())
    ) {
      setError(`${brand} est déjà dans cette campagne.`);
      return;
    }

    const prior = findHistoryForBrand(brandHistory, {
      marqueId: opts.marqueId,
      nom: brand,
    });
    if (prior?.blocked) {
      const via =
        prior.source === "wave" && prior.viaTalent
          ? prior.viaTalent
          : selectedCampaign.talentName;
      setError(
        `« ${prior.targetBrand} » déjà contactée pour ${via} le ${formatFrDate(prior.sentAt)}. ` +
          `Bloqué encore ${prior.daysLeft} j (vague marque ${recontactDays} j, tous talents).`
      );
      return;
    }

    setSavingBrandId(opts.savingKey);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/strategy/contact-missions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          talentId: selectedCampaign.talentId,
          creatorName: selectedCampaign.talentName,
          targetBrand: brand,
          marqueId: opts.marqueId ?? null,
          strategyReason: brandForm.strategyReason.trim() || "À préciser",
          recommendedAngle: brandForm.recommendedAngle.trim() || null,
          priority: brandForm.priority,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout marque impossible.");
      setSuccess(`${brand} ajoutée.`);
      await Promise.all([
        loadMissions(),
        loadCampaigns(),
        loadBrandHistory(selectedCampaign.talentId),
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setSavingBrandId(null);
    }
  }

  async function addFromCrm(hit: MarqueHit) {
    await addBrand({
      targetBrand: hit.nom,
      marqueId: hit.id,
      savingKey: hit.id,
    });
  }

  async function addManual(event: FormEvent) {
    event.preventDefault();
    const brand = manualBrand.trim();
    if (!brand) return;
    await addBrand({ targetBrand: brand, marqueId: null, savingKey: "__manual__" });
    setManualBrand("");
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

  const brandBusy = Boolean(savingBrandId);
  const manualPrior = findHistoryForBrand(brandHistory, { nom: manualBrand });

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-6 md:p-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Stratégies de contact talents</h1>
            <p className="mt-1 text-sm text-gray-500">
              Campagne de prospection talent : choisis d&apos;abord dans le CRM, saisie libre seulement
              si la marque n&apos;existe pas. Recontact bloqué {recontactDays} j après envoi pour le
              même talent.
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
          <h2 className="text-sm font-semibold text-gray-900">Campagnes</h2>
          <a href="/strategy/projet-individuel-talent/pipeline" className="text-xs text-gray-600 underline">
            Ouvrir pipeline partage
          </a>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <form onSubmit={onCreateCampaign} className="rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Créer une campagne</h3>
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
            <button
              type="submit"
              disabled={savingCampaign}
              className="rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {savingCampaign ? "Création..." : "Créer la campagne"}
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

      {selectedCampaign ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">CRM Marques</h2>
              <p className="mt-1 text-xs text-gray-500">
                Parcours le CRM et clique Ajouter autant de fois que besoin —{" "}
                <span className="font-medium text-gray-700">{selectedCampaign.talentName}</span>
                . Si déjà envoyé pour ce talent, la date s&apos;affiche ; blocage {recontactDays} j.
              </p>
            </div>
            <select
              value={brandForm.priority}
              onChange={(e) =>
                setBrandForm((v) => ({ ...v, priority: e.target.value as Mission["priority"] }))
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              aria-label="Priorité"
            >
              <option value="LOW">Priorité basse</option>
              <option value="MEDIUM">Priorité moyenne</option>
              <option value="HIGH">Priorité haute</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">
                Raison strategy (appliquée aux prochains ajouts)
              </span>
              <input
                value={brandForm.strategyReason}
                onChange={(e) => setBrandForm((v) => ({ ...v, strategyReason: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Optionnel — réutilisée à chaque Ajouter"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Angle recommandé (optionnel)</span>
              <input
                value={brandForm.recommendedAngle}
                onChange={(e) => setBrandForm((v) => ({ ...v, recommendedAngle: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Optionnel"
              />
            </label>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={crmFilter}
              onChange={(e) => setCrmFilter(e.target.value)}
              placeholder="Filtrer le CRM…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="max-h-[360px] overflow-auto rounded-xl border border-gray-200 bg-gray-50">
            {crmLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du CRM…
              </div>
            ) : filteredCrm.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                {crm.length === 0
                  ? "Aucune marque dans le CRM."
                  : "Aucun résultat pour ce filtre."}
              </div>
            ) : (
              filteredCrm.map((h) => {
                const alreadyInCampaign =
                  alreadyIds.has(h.id) || alreadyNames.has(h.nom.trim().toLowerCase());
                const prior = findHistoryForBrand(brandHistory, {
                  marqueId: h.id,
                  nom: h.nom,
                });
                const blocked = Boolean(prior?.blocked);
                const rowBusy = savingBrandId === h.id;
                return (
                  <div
                    key={h.id}
                    className={`flex items-center gap-3 border-b border-gray-100 px-3.5 py-2.5 ${
                      alreadyInCampaign || blocked ? "bg-transparent" : "bg-white"
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-700">
                      {h.nom.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-gray-900">{h.nom}</div>
                      <div
                        className={`text-[11.5px] ${
                          h.contactCount <= 1
                            ? "font-semibold text-amber-700"
                            : "text-gray-500"
                        }`}
                      >
                        {h.contactCount} contact{h.contactCount === 1 ? "" : "s"}
                        {h.ville ? ` · ${h.ville}` : ""}
                      </div>
                      {prior ? (
                        <div
                          className={`mt-0.5 text-[11px] font-medium ${
                            prior.blocked ? "text-red-600" : "text-amber-700"
                          }`}
                        >
                          Déjà contactée
                          {prior.source === "wave" && prior.viaTalent
                            ? ` pour ${prior.viaTalent}`
                            : ` pour ${selectedCampaign.talentName}`}{" "}
                          le {formatFrDate(prior.sentAt)}
                          {prior.blocked
                            ? ` · bloqué ${prior.daysLeft} j`
                            : ` · ok (il y a ${prior.daysAgo} j)`}
                        </div>
                      ) : null}
                    </div>
                    {alreadyInCampaign ? (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                        Déjà ajoutée
                      </span>
                    ) : blocked ? (
                      <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
                        Bloqué {prior?.daysLeft ?? "—"} j
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={brandBusy || rowBusy}
                        onClick={() => void addFromCrm(h)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1A1110] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Ajouter
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={addManual} className="flex flex-wrap items-end gap-2">
            <label className="min-w-[180px] flex-1 space-y-1">
              <span className="text-xs font-medium text-gray-600">
                Pas dans le CRM ? Saisie libre
              </span>
              <input
                value={manualBrand}
                onChange={(e) => setManualBrand(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Nouvelle marque"
              />
              {manualPrior ? (
                <span
                  className={`block text-[11px] font-medium ${
                    manualPrior.blocked ? "text-red-600" : "text-amber-700"
                  }`}
                >
                  Déjà contactée
                  {manualPrior.source === "wave" && manualPrior.viaTalent
                    ? ` pour ${manualPrior.viaTalent}`
                    : ""}{" "}
                  le {formatFrDate(manualPrior.sentAt)}
                  {manualPrior.blocked
                    ? ` · bloqué ${manualPrior.daysLeft} j`
                    : ` · ok (il y a ${manualPrior.daysAgo} j)`}
                </span>
              ) : null}
            </label>
            <button
              type="submit"
              disabled={brandBusy || !manualBrand.trim() || Boolean(manualPrior?.blocked)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
            >
              {savingBrandId === "__manual__" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Ajouter libre
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          Cartes de la campagne
          {selectedCampaign ? ` — ${selectedCampaign.title}` : ""}
        </h2>
        <div className="mt-3 max-h-[70vh] space-y-2 overflow-auto">
          {missions.map((m) => (
            <article key={m.id} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900">
                {m.creatorName} → {m.targetBrand}
              </p>
              <p className="mt-1 text-xs text-gray-600">{m.strategyReason}</p>
              <p className="mt-1 text-[11px] text-gray-500">
                Campagne: {m.campaignTitle || "—"} · Priorité: {PRIORITY_LABEL[m.priority]} · Statut:{" "}
                {STATUS_LABEL[m.status]}
                {m.marqueId ? " · CRM lié" : ""}
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
          {!loading && selectedCampaign && missions.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucune carte pour l&apos;instant — ajoute-les depuis le CRM ci-dessus.
            </p>
          ) : null}
          {!selectedCampaign ? (
            <p className="text-sm text-gray-500">Sélectionne une campagne pour voir ses cartes.</p>
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
