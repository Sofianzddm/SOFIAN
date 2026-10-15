"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Check, RefreshCw, Search } from "lucide-react";
import { canEditBrief } from "@/lib/projets-outreach";

type WaveCluster = {
  id: string;
  targetBrand: string;
  decision: "PENDING" | "CONDENSE" | "SOLO";
  primaryMissionId: string | null;
  missionCount: number;
  forceHoldCondense?: boolean;
  heldCount?: number;
  missions: Array<{
    id: string;
    creatorName: string;
    campaignId: string | null;
    campaignTitle: string | null;
    condensationRole: string | null;
    sentAt?: string | null;
    brandCooldownUntil?: string | null;
  }>;
};

type WaveRow = {
  id: string;
  title: string;
  status: "COLLECTING" | "REVIEWING_CONDENSATIONS" | "OPEN_FOR_DRAFTING" | "CLOSED";
  statusLabel: string;
  campaignCount: number;
  clusterCount: number;
  campaigns: Array<{
    id: string;
    title: string;
    status: string;
    talentName: string;
    missionCount: number;
  }>;
  clusters: WaveCluster[];
};

function pendingCount(w: WaveRow): number {
  return w.clusters.filter((cl) => cl.decision === "PENDING").length;
}

function statusBadgeStyle(status: WaveRow["status"]): {
  background: string;
  color: string;
} {
  if (status === "OPEN_FOR_DRAFTING") return { background: "#E6F6EE", color: "#1F7A4D" };
  if (status === "REVIEWING_CONDENSATIONS")
    return { background: "#FBF1DC", color: "#956A15" };
  return { background: "#EEEAFB", color: "#5B3F9E" };
}

/** Priorité : review avec PENDING → collecte → review → ouverte. */
function sortWaves(list: WaveRow[]): WaveRow[] {
  const rank = (w: WaveRow) => {
    const pending = pendingCount(w);
    if (w.status === "REVIEWING_CONDENSATIONS" && pending > 0) return 0;
    if (w.status === "COLLECTING") return 1;
    if (w.status === "REVIEWING_CONDENSATIONS") return 2;
    return 3;
  };
  return [...list].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return pendingCount(b) - pendingCount(a);
  });
}

export function OutreachWavePanel({ role }: { role: string }) {
  const canStrategy = canEditBrief(role);
  const [waves, setWaves] = useState<WaveRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const orderedWaves = useMemo(() => sortWaves(waves), [waves]);
  const wave =
    orderedWaves.find((w) => w.id === selectedId) || orderedWaves[0] || null;
  const pendingClusters = wave
    ? wave.clusters.filter((cl) => cl.decision === "PENDING")
    : [];
  const autoHoldCondensed = wave
    ? wave.clusters.filter(
        (cl) => cl.decision === "CONDENSE" && Boolean(cl.forceHoldCondense)
      )
    : [];
  const totalPendingAcrossWaves = useMemo(
    () => waves.reduce((sum, w) => sum + pendingCount(w), 0),
    [waves]
  );
  const reviewingWaves = useMemo(
    () =>
      waves.filter(
        (w) => w.status === "REVIEWING_CONDENSATIONS" && pendingCount(w) > 0
      ),
    [waves]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projets-outreach/waves?active=1", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement vague impossible.");
      const next = Array.isArray(data.waves) ? (data.waves as WaveRow[]) : [];
      setWaves(next);
      setSelectedId((prev) => {
        if (prev && next.some((w) => w.id === prev)) return prev;
        return sortWaves(next)[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureWave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projets-outreach/waves", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Création vague impossible.");
      setSuccess("Vague de collecte prête — les nouveaux projets s’y rattachent.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function attachExisting(waveId: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/projets-outreach/waves/${waveId}/attach-existing`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Rattachement impossible.");
      setSuccess(
        data.message ||
          `${data.attached ?? 0} projet(s) rattaché(s). Clique ensuite sur Analyser les condensations.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function completeWave(waveId: string, opts?: { rescan?: boolean; silent?: boolean }) {
    if (
      !opts?.rescan &&
      !opts?.silent &&
      !window.confirm(
        "Analyser les condensations ? Casting restera bloquée jusqu’à ta validation (Condenser / Solo)."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/waves/${waveId}/complete`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Analyse impossible.");
      setSelectedId(waveId);
      setSuccess(data.message || "Analyse terminée — valide les condensations.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  /** Bouton principal : scan/rescan la vague concernée (ou toutes les vagues en review). */
  async function analyzeCondensations() {
    if (!canStrategy) return;

    // Priorité : vague sélectionnée si scannable
    const target =
      wave &&
      (wave.status === "COLLECTING" || wave.status === "REVIEWING_CONDENSATIONS") &&
      wave.campaignCount > 0
        ? wave
        : reviewingWaves[0] ||
          orderedWaves.find(
            (w) =>
              (w.status === "COLLECTING" || w.status === "REVIEWING_CONDENSATIONS") &&
              w.campaignCount > 0
          ) ||
          null;

    if (!target) {
      setError(
        "Aucune vague à analyser. Ouvre une vague en collecte, ou choisis une vague encore en validation."
      );
      return;
    }

    const isRescan = target.status === "REVIEWING_CONDENSATIONS";
    if (
      !window.confirm(
        isRescan
          ? `Rescanner « ${target.title} » pour mettre à jour les marques en commun ?`
          : `Analyser les condensations de « ${target.title} » ?\nCasting restera bloquée jusqu’à ta validation.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      // Si plusieurs vagues encore en review avec PENDING, on les rescane toutes
      const toScan =
        isRescan && reviewingWaves.length > 1
          ? reviewingWaves
          : [target];

      const messages: string[] = [];
      for (const w of toScan) {
        const res = await fetch(`/api/projets-outreach/waves/${w.id}/complete`, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || `Analyse impossible sur « ${w.title} ».`
          );
        }
        messages.push(
          `« ${w.title} » : ${data.message || "OK"}`
        );
      }
      setSelectedId(toScan[0]?.id ?? target.id);
      setSuccess(messages.join(" · "));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function setDecision(
    waveId: string,
    clusterId: string,
    decision: "CONDENSE" | "SOLO"
  ) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/projets-outreach/waves/${waveId}/clusters`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Décision impossible.");

      const current = waves.find((w) => w.id === waveId);
      const pendingLeft = (current?.clusters || []).filter(
        (cl) => cl.id !== clusterId && cl.decision === "PENDING"
      ).length;

      setWaves((prev) =>
        prev.map((w) =>
          w.id !== waveId
            ? w
            : {
                ...w,
                clusters: w.clusters.map((cl) =>
                  cl.id === clusterId ? { ...cl, decision } : cl
                ),
              }
        )
      );

      if (pendingLeft === 0) {
        await postValidate(waveId);
        setSuccess(
          decision === "CONDENSE"
            ? "Condensé — Casting peut rédiger."
            : "Solo — Casting peut rédiger."
        );
        await load();
      } else {
        setSuccess(
          decision === "CONDENSE" ? "Marque condensée." : "Marque en solo."
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setAllDecisions(waveId: string, decision: "CONDENSE" | "SOLO") {
    const label =
      decision === "CONDENSE"
        ? "Condenser toutes les marques en commun ?"
        : "Passer toutes les marques en solo ?";
    if (!window.confirm(label)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/projets-outreach/waves/${waveId}/clusters`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action impossible.");

      setWaves((prev) =>
        prev.map((w) =>
          w.id !== waveId
            ? w
            : {
                ...w,
                clusters: w.clusters.map((cl) => ({ ...cl, decision })),
              }
        )
      );

      await postValidate(waveId);
      setSuccess(
        decision === "CONDENSE"
          ? "Tout condensé — Casting peut rédiger."
          : "Tout en solo — Casting peut rédiger."
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function postValidate(waveId: string) {
    const res = await fetch(`/api/projets-outreach/waves/${waveId}/validate`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Validation impossible.");
    return data;
  }

  async function validateWave(waveId: string) {
    if (!window.confirm("Laisser Casting rédiger ?")) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postValidate(waveId);
      setSuccess(data.message || "Casting peut rédiger.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const canAnalyze =
    canStrategy &&
    (Boolean(
      wave &&
        (wave.status === "COLLECTING" ||
          wave.status === "REVIEWING_CONDENSATIONS") &&
        wave.campaignCount > 0
    ) ||
      reviewingWaves.length > 0);

  return (
    <div
      style={{
        marginTop: 22,
        border: "1px solid #E8E4F5",
        background: "#FAF9FD",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#7A5AF8]">
            Vagues & condensations
          </div>
          <h2 className="mt-1 text-[16px] font-semibold text-[#1A1110]">
            {wave ? wave.title : "Aucune vague active"}
          </h2>
          <p className="mt-1 text-[13px] text-[#6B6B76] max-w-2xl">
            Analyse les marques en commun entre projets SOLO, puis choisis Condenser
            (1 mail) ou Solo. Les projets communs MULTI sont exclus (déjà multi-talents).
            Casting ne rédige qu’après validation.
          </p>
          {totalPendingAcrossWaves > 0 && (
            <p className="mt-2 text-[13px] font-semibold text-[#956A15]">
              {totalPendingAcrossWaves} marque(s) encore à trancher sur{" "}
              {reviewingWaves.length} vague(s).
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="po-btn po-btn-icon"
            onClick={() => void load()}
            aria-label="Rafraîchir vagues"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {canStrategy && canAnalyze && (
            <button
              type="button"
              className="po-btn po-btn-primary"
              disabled={busy}
              onClick={() => void analyzeCondensations()}
              style={{ fontWeight: 700, padding: "10px 16px" }}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Analyser les condensations
              {totalPendingAcrossWaves > 0
                ? ` (${totalPendingAcrossWaves})`
                : ""}
            </button>
          )}
          {canStrategy && !wave && (
            <button
              type="button"
              className="po-btn po-btn-primary"
              disabled={busy}
              onClick={() => void ensureWave()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ouvrir une vague
            </button>
          )}
        </div>
      </div>

      {(error || success) && (
        <div
          className={error ? "po-alert-error" : "po-alert-ok"}
          style={{ marginTop: 12 }}
        >
          {error || success}
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-[#6B6B76]">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : wave ? (
        <div className="mt-4 space-y-4">
          {orderedWaves.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {orderedWaves.map((w) => {
                const pending = pendingCount(w);
                const active = w.id === wave.id;
                const badge = statusBadgeStyle(w.status);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedId(w.id)}
                    className="rounded-lg border px-3 py-2 text-left text-[12px] transition"
                    style={{
                      borderColor: active ? "#7A5AF8" : "#E8E8EC",
                      background: active ? "#F4F0FC" : "#fff",
                      boxShadow: active ? "0 0 0 1px #7A5AF8" : undefined,
                    }}
                  >
                    <div className="font-semibold text-[#1A1110]">{w.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        style={{
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontWeight: 600,
                          fontSize: 11,
                          ...badge,
                        }}
                      >
                        {w.statusLabel}
                      </span>
                      <span className="text-[#6B6B76]">
                        {w.campaignCount} projet(s)
                      </span>
                      {pending > 0 && (
                        <span className="font-semibold text-[#956A15]">
                          · {pending} à trancher
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span
              style={{
                borderRadius: 999,
                padding: "4px 10px",
                fontWeight: 600,
                ...statusBadgeStyle(wave.status),
              }}
            >
              {wave.statusLabel}
            </span>
            <span className="text-[#6B6B76]">
              {wave.campaignCount} projet(s) · {wave.clusterCount} marque(s)
              partagée(s)
              {pendingClusters.length > 0
                ? ` · ${pendingClusters.length} en attente`
                : ""}
            </span>
          </div>

          {wave.campaigns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {wave.campaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/projets-outreach/${c.id}`}
                  className="rounded-lg border border-[#E8E8EC] bg-white px-3 py-2 text-[12px] hover:border-[#C4B5F0]"
                >
                  <strong>{c.talentName}</strong>
                  <span className="text-[#6B6B76]"> · {c.title}</span>
                  <span className="text-[#9A9AA3]"> · {c.missionCount} marques</span>
                </Link>
              ))}
            </div>
          )}

          {wave.status === "COLLECTING" ||
          wave.status === "REVIEWING_CONDENSATIONS" ? (
            <div
              style={{
                marginTop: 12,
                borderRadius: 10,
                padding: "10px 12px",
                background: "#F4F0FC",
                border: "1px solid #D4C4F7",
                color: "#5B3F9E",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Casting est en pause sur cette vague
              {wave.status === "COLLECTING"
                ? " — les projets ne sont pas encore tous prêts."
                : " — il reste à valider les marques en commun."}
            </div>
          ) : null}

          {wave.status === "COLLECTING" && canStrategy && (
            <div className="flex flex-wrap gap-2">
              {wave.campaignCount === 0 && (
                <button
                  type="button"
                  className="po-btn"
                  disabled={busy}
                  onClick={() => void attachExisting(wave.id)}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Rattacher les projets déjà créés
                </button>
              )}
              {wave.campaignCount > 0 && (
                <button
                  type="button"
                  className="po-btn"
                  disabled={busy}
                  onClick={() => void attachExisting(wave.id)}
                  title="Rattacher d’autres projets Outreach actifs hors vague"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Ajouter les projets manquants
                </button>
              )}
              <button
                type="button"
                className="po-btn po-btn-primary"
                disabled={busy || wave.campaignCount === 0}
                onClick={() => void completeWave(wave.id)}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Analyser les condensations
              </button>
            </div>
          )}

          {wave.status === "REVIEWING_CONDENSATIONS" && canStrategy && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="po-btn po-btn-primary"
                disabled={busy}
                onClick={() => void analyzeCondensations()}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Analyser les condensations
              </button>
              <button
                type="button"
                className="po-btn"
                disabled={busy}
                onClick={() => void completeWave(wave.id, { rescan: true })}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Rescanner cette vague
              </button>
            </div>
          )}

          {wave.status === "REVIEWING_CONDENSATIONS" && (
            <div className="space-y-3">
              {autoHoldCondensed.length > 0 ? (
                <div
                  style={{
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: "#FFFBF0",
                    border: "1px solid #E8D48B",
                    fontSize: 13,
                    color: "#956A15",
                  }}
                >
                  <strong>
                    {autoHoldCondensed.length} marque(s) auto-condensée(s)
                  </strong>{" "}
                  (en attente sur plusieurs projets) — Solo interdit, 1 mail à
                  J+30 :{" "}
                  {autoHoldCondensed.map((c) => c.targetBrand).join(", ")}
                </div>
              ) : null}
              {wave.clusters.length === 0 ? (
                <p className="text-[13px] text-[#6B6B76]">
                  Aucune marque en commun entre talents. Tu peux ouvrir le Casting.
                </p>
              ) : pendingClusters.length === 0 ? (
                <p className="text-[13px] text-[#6B6B76]">
                  Toutes les marques sont tranchées.
                </p>
              ) : (
                <>
                  {canStrategy && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="po-btn po-btn-primary"
                        disabled={busy}
                        onClick={() => void setAllDecisions(wave.id, "CONDENSE")}
                      >
                        Tout condenser
                      </button>
                      <button
                        type="button"
                        className="po-btn"
                        disabled={busy}
                        onClick={() => void setAllDecisions(wave.id, "SOLO")}
                      >
                        Tout solo
                      </button>
                    </div>
                  )}
                  {pendingClusters.map((cl) => {
                    const forceHold = Boolean(cl.forceHoldCondense);
                    return (
                    <div
                      key={cl.id}
                      className="rounded-xl border border-[#E8E4F5] bg-white p-3"
                      style={
                        forceHold
                          ? { borderColor: "#E8D48B", background: "#FFFBF0" }
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[14px]">
                            {cl.targetBrand}
                            {forceHold ? (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "#956A15",
                                }}
                              >
                                Auto-condensée (attente multi-projets)
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-[12px] text-[#6B6B76]">
                            {cl.missions.map((m) => m.creatorName).join(" · ")}
                          </div>
                          <ul className="mt-2 space-y-0.5 text-[12px] text-[#4A4A52]">
                            {cl.missions.map((m) => (
                              <li key={m.id}>
                                {m.creatorName}
                                {m.campaignTitle ? ` — ${m.campaignTitle}` : ""}
                                {m.sentAt ? " · déjà contactée" : ""}
                                {m.brandCooldownUntil ? " · en attente" : ""}
                              </li>
                            ))}
                          </ul>
                          {forceHold ? (
                            <p className="mt-2 text-[11px] text-[#956A15]">
                              Marque en attente sur plusieurs projets → Solo
                              interdit. 1 mail commun au déblocage J+30.
                            </p>
                          ) : null}
                          {cl.missions.some((m) => m.sentAt) &&
                            cl.missions.some((m) => !m.sentAt) && (
                              <p className="mt-2 text-[11px] text-[#956A15]">
                                Une partie déjà envoyée : si tu condensés, pas de 2ᵉ
                                mail — le talent restant sera porté par la prochaine
                                relance PRIMARY.
                              </p>
                            )}
                        </div>
                        {canStrategy && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="po-btn po-btn-primary"
                              disabled={busy}
                              onClick={() =>
                                void setDecision(wave.id, cl.id, "CONDENSE")
                              }
                            >
                              Condenser
                            </button>
                            <button
                              type="button"
                              className="po-btn"
                              disabled={busy || forceHold}
                              title={
                                forceHold
                                  ? "Solo interdit : marque en attente multi-projets"
                                  : undefined
                              }
                              style={forceHold ? { opacity: 0.4 } : undefined}
                              onClick={() =>
                                void setDecision(wave.id, cl.id, "SOLO")
                              }
                            >
                              Solo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </>
              )}

              {canStrategy && pendingClusters.length === 0 && (
                <button
                  type="button"
                  className="po-btn po-btn-primary"
                  disabled={busy}
                  onClick={() => void validateWave(wave.id)}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Laisser Casting rédiger
                </button>
              )}
            </div>
          )}

          {wave.status === "OPEN_FOR_DRAFTING" && (
            <div className="space-y-2">
              <p className="text-[13px] text-[#1F7A4D] font-medium">
                C’est bon : Casting peut rédiger sur cette vague.
              </p>
              {reviewingWaves.length > 0 && canStrategy && (
                <p className="text-[13px] text-[#956A15]">
                  Attention : {reviewingWaves.length} autre(s) vague(s) ont encore des
                  condensations à valider — utilise le bouton{" "}
                  <strong>Analyser les condensations</strong> ou sélectionne-les
                  ci-dessus.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-[#6B6B76]">
          Ouvre une vague pour regrouper les projets du mois.
        </p>
      )}
    </div>
  );
}
