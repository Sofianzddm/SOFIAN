"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Check, RefreshCw } from "lucide-react";
import { canEditBrief } from "@/lib/projets-outreach";

type WaveCluster = {
  id: string;
  targetBrand: string;
  decision: "PENDING" | "CONDENSE" | "SOLO";
  primaryMissionId: string | null;
  missionCount: number;
  missions: Array<{
    id: string;
    creatorName: string;
    campaignId: string | null;
    campaignTitle: string | null;
    condensationRole: string | null;
    sentAt?: string | null;
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

export function OutreachWavePanel({ role }: { role: string }) {
  const canStrategy = canEditBrief(role);
  const [waves, setWaves] = useState<WaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projets-outreach/waves?active=1", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement vague impossible.");
      setWaves(Array.isArray(data.waves) ? data.waves : []);
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
          `${data.attached ?? 0} projet(s) rattaché(s). Clique ensuite sur Terminé.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function completeWave(waveId: string, opts?: { rescan?: boolean }) {
    if (
      !opts?.rescan &&
      !window.confirm(
        "Terminer la collecte ? Casting restera bloquée jusqu’à ta validation des condensations."
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
      if (!res.ok) throw new Error(data.error || "Impossible de terminer.");
      setSuccess(data.message || "Collecte terminée — valide les condensations.");
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

      const pendingLeft = (wave?.clusters || []).filter(
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

  const wave = waves[0] || null;
  const pendingClusters =
    wave?.clusters.filter((cl) => cl.decision === "PENDING") || [];

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
            Vague du mois
          </div>
          <h2 className="mt-1 text-[16px] font-semibold text-[#1A1110]">
            {wave ? wave.title : "Aucune vague active"}
          </h2>
          <p className="mt-1 text-[13px] text-[#6B6B76] max-w-2xl">
            Tu prépares les projets, tu cliques Terminé, puis tu choisis pour chaque marque
            en commun : un seul mail ou des envois séparés. Casting ne peut rédiger qu’après
            ta validation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="po-btn po-btn-icon"
            onClick={() => void load()}
            aria-label="Rafraîchir vague"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
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
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span
              style={{
                borderRadius: 999,
                padding: "4px 10px",
                background:
                  wave.status === "OPEN_FOR_DRAFTING"
                    ? "#E6F6EE"
                    : wave.status === "REVIEWING_CONDENSATIONS"
                      ? "#FBF1DC"
                      : "#EEEAFB",
                color:
                  wave.status === "OPEN_FOR_DRAFTING"
                    ? "#1F7A4D"
                    : wave.status === "REVIEWING_CONDENSATIONS"
                      ? "#956A15"
                      : "#5B3F9E",
                fontWeight: 600,
              }}
            >
              {wave.statusLabel}
            </span>
            <span className="text-[#6B6B76]">
              {wave.campaignCount} projet(s) · {wave.clusterCount} marque(s) partagée(s)
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

          {wave.status === "COLLECTING" || wave.status === "REVIEWING_CONDENSATIONS" ? (
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
                  className="po-btn po-btn-primary"
                  disabled={busy}
                  onClick={() => void attachExisting(wave.id)}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Analyser les projets déjà créés
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
                  <Check className="h-3.5 w-3.5" />
                )}
                Terminé — chercher les marques en commun
              </button>
            </div>
          )}

          {wave.status === "REVIEWING_CONDENSATIONS" && canStrategy && (
            <div className="mb-3">
              <button
                type="button"
                className="po-btn"
                disabled={busy}
                onClick={() => void completeWave(wave.id, { rescan: true })}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Rescanner
              </button>
            </div>
          )}

          {wave.status === "REVIEWING_CONDENSATIONS" && (
            <div className="space-y-3">
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
                  {pendingClusters.map((cl) => (
                  <div
                    key={cl.id}
                    className="rounded-xl border border-[#E8E4F5] bg-white p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[14px]">{cl.targetBrand}</div>
                        <div className="mt-1 text-[12px] text-[#6B6B76]">
                          {cl.missions.map((m) => m.creatorName).join(" · ")}
                        </div>
                        <ul className="mt-2 space-y-0.5 text-[12px] text-[#4A4A52]">
                          {cl.missions.map((m) => (
                            <li key={m.id}>
                              {m.creatorName}
                              {m.campaignTitle ? ` — ${m.campaignTitle}` : ""}
                              {m.sentAt ? " · déjà contactée" : ""}
                            </li>
                          ))}
                        </ul>
                        {cl.missions.some((m) => m.sentAt) &&
                          cl.missions.some((m) => !m.sentAt) && (
                            <p className="mt-2 text-[11px] text-[#956A15]">
                              Une partie déjà envoyée : si tu condensés, pas de 2ᵉ mail — le talent
                              restant sera porté par la prochaine relance PRIMARY.
                            </p>
                          )}
                      </div>
                      {canStrategy && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="po-btn po-btn-primary"
                            disabled={busy}
                            onClick={() => void setDecision(wave.id, cl.id, "CONDENSE")}
                          >
                            Condenser
                          </button>
                          <button
                            type="button"
                            className="po-btn"
                            disabled={busy}
                            onClick={() => void setDecision(wave.id, cl.id, "SOLO")}
                          >
                            Solo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  ))}
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
            <p className="text-[13px] text-[#1F7A4D] font-medium">
              C’est bon : Casting peut rédiger. Pour les marques condensées, un seul mail
              couvre tous les projets.
            </p>
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
