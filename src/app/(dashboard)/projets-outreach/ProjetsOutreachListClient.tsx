"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  STATUS_LABEL,
  CAMPAIGN_STATUSES,
  canCreateCampaign,
  type CampaignStatus,
} from "@/lib/projets-outreach";
import { KpiCard, PoAvatar, StageStepper, StatusBadge } from "./PoUi";
import "./po.css";

type CampaignRow = {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  isActive: boolean;
  talentId: string;
  talentName: string;
  talentPhoto: string | null;
  ownerTmName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  missionCount: number;
  sentCount: number;
  answeredCount: number;
  budgetRange: string | null;
  objective: string | null;
};

type TalentOption = { id: string; name: string };

const FILTERS: { id: "" | CampaignStatus; label: string }[] = [
  { id: "", label: "Tous" },
  ...CAMPAIGN_STATUSES.map((s) => ({
    id: s,
    label: s === "SENDING" ? "Envoi" : STATUS_LABEL[s],
  })),
];

export function ProjetsOutreachListClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canCreate = canCreateCampaign(role);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | CampaignStatus>("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    title: "",
    talentId: "",
    description: "",
    objective: "",
    deliverables: "",
    budgetRange: "",
    timeline: "",
    dos: "",
    donts: "",
    angles: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projets-outreach", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger les projets.");
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canCreate) return;
    void (async () => {
      const res = await fetch("/api/talents?presskit=true", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = Array.isArray(data.talents) ? data.talents : [];
      setTalents(
        list.map((t: { id: string; name: string }) => ({
          id: String(t.id),
          name: String(t.name || ""),
        }))
      );
    })();
  }, [canCreate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.talentName.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
      );
    });
  }, [campaigns, statusFilter, query]);

  const kpis = useMemo(() => {
    const actifs = campaigns.filter((c) => c.status !== "CLOSED").length;
    const marques = campaigns.reduce((n, c) => n + (c.missionCount || 0), 0);
    const contactees = campaigns.reduce((n, c) => n + (c.sentCount || 0), 0);
    const reponses = campaigns.reduce((n, c) => n + (c.answeredCount || 0), 0);
    return [
      { label: "Projets actifs", value: actifs, dot: "#B67C7C", hint: "en pipeline" },
      { label: "Marques ciblées", value: marques, dot: "#7A5AF8" },
      { label: "Contactées", value: contactees, dot: "#C45C26", hint: "en attente" },
      { label: "Réponses", value: reponses, dot: "#2E9E63" },
    ];
  }, [campaigns]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projets-outreach", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Création impossible.");
      router.push(`/projets-outreach/${data.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  }

  return (
    <div className="po-root">
      <div className="po-page">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="po-h1">Projets outreach talent</h1>
            <p className="po-sub">
              Parcours projet : brief → marques → rédaction → envoi Leyna.{" "}
              <span style={{ color: "var(--po-muted)" }}>
                Indépendant du Pipeline Casting.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="po-btn po-btn-icon"
              onClick={() => void load()}
              aria-label="Rafraîchir"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {canCreate && (
              <button
                type="button"
                className="po-btn po-btn-primary"
                onClick={() => setShowCreate((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                Nouveau projet
              </button>
            )}
          </div>
        </div>

        <div className="mt-[22px] flex flex-wrap items-center gap-[7px]">
          {FILTERS.map((f) => (
            <button
              key={f.id || "all"}
              type="button"
              className={`po-chip ${statusFilter === f.id ? "po-chip-active" : ""}`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          <input
            className="po-search ml-auto"
            placeholder="Filtrer par nom, talent…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="po-kpi-grid my-5">
          {kpis.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} dot={k.dot} hint={k.hint} />
          ))}
        </div>

        {showCreate && canCreate && (
          <form onSubmit={onCreate} className="po-card po-card-pad mb-5 space-y-4">
            <div className="text-[13.5px] font-bold">Nouveau projet</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="po-field-label">Talent *</div>
                <select
                  required
                  className="po-select"
                  value={form.talentId}
                  onChange={(e) => setForm((f) => ({ ...f, talentId: e.target.value }))}
                >
                  <option value="">Sélectionner…</option>
                  {talents.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="po-field-label">Nom du projet *</div>
                <input
                  required
                  className="po-input"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ex. Shoot Ibiza · Collab beauté"
                />
              </label>
              <label className="block md:col-span-2">
                <div className="po-field-label">Description</div>
                <textarea
                  className="po-textarea"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <label className="block md:col-span-2">
                <div className="po-field-label">Objectif</div>
                <textarea
                  className="po-textarea"
                  rows={2}
                  value={form.objective}
                  onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--po-sep)] pt-4">
              <button
                type="button"
                className="po-btn po-btn-secondary"
                onClick={() => setShowCreate(false)}
              >
                Annuler
              </button>
              <button type="submit" disabled={saving} className="po-btn po-btn-primary">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Créer et ouvrir
              </button>
            </div>
          </form>
        )}

        {error && <div className="po-alert-error mb-4">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--po-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="po-empty">
            {campaigns.length === 0
              ? "Aucun projet pour l’instant."
              : "Aucun projet à ce stade."}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/projets-outreach/${c.id}`}
                className="po-card po-card-pad po-card-interactive block !text-inherit no-underline hover:!text-inherit"
              >
                <div className="flex items-start gap-[15px]">
                  <PoAvatar name={c.talentName} photo={c.talentPhoto} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[9px]">
                      <span className="text-[15px] font-bold tracking-[-0.01em] text-[var(--po-ink)]">
                        {c.title}
                      </span>
                      <StatusBadge status={c.status} />
                      <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--po-accent)]">
                        Gérer <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
                      </span>
                    </div>
                    <div className="mt-[3px] text-[12.5px] text-[var(--po-tertiary)]">
                      {c.talentName}
                      {c.ownerTmName ? ` · TM ${c.ownerTmName}` : ""}
                    </div>
                    {(c.description || c.objective) && (
                      <p
                        className="mt-2 max-w-[760px] text-[13px] leading-normal text-[var(--po-secondary)]"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {c.description || c.objective}
                      </p>
                    )}
                    <div className="mt-3.5 flex flex-wrap items-center gap-[5px]">
                      <StageStepper status={c.status} compact />
                      <div className="ml-auto flex gap-3.5 text-[12.5px] text-[var(--po-tertiary)] tabular-nums">
                        <span>
                          <b className="font-bold text-[var(--po-ink)]">{c.missionCount}</b>{" "}
                          marques
                        </span>
                        <span>
                          <b className="font-bold text-[var(--po-ink)]">{c.sentCount}</b>{" "}
                          contactées
                        </span>
                        <span>
                          <b className="font-bold text-[var(--po-ink)]">{c.answeredCount}</b>{" "}
                          réponses
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
