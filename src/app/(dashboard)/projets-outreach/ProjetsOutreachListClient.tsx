"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, Check, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  STATUS_LABEL,
  CAMPAIGN_STATUSES,
  canCreateCampaign,
  type CampaignStatus,
} from "@/lib/projets-outreach";
import { KpiCard, PoAvatar, StageStepper, StatusBadge } from "./PoUi";
import { OutreachWavePanel } from "./OutreachWavePanel";
import "./po.css";

type CampaignRow = {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  mode?: "SOLO" | "MULTI";
  isActive: boolean;
  talentId: string;
  talentName: string;
  talentPhoto: string | null;
  talents?: Array<{ id: string; name: string; photo: string | null }>;
  talentCount?: number;
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

type AwaitingCompletionItem = {
  missionId: string;
  brandName: string;
  marqueId: string | null;
  creatorName: string | null;
  strategyReason: string | null;
  emailableCount: number;
  contactCount: number;
  requestedAt: string | null;
  updatedAt: string;
  campaignId: string | null;
  campaignTitle: string | null;
  campaignStatus: string | null;
  talentName: string;
  requestedByName: string | null;
};

const FILTERS: { id: "" | CampaignStatus; label: string }[] = [
  { id: "", label: "Tous" },
  ...CAMPAIGN_STATUSES.map((s) => ({
    id: s,
    label: s === "SENDING" ? "Envoi" : STATUS_LABEL[s],
  })),
];

function formatRelativeFr(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "à l’instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export function ProjetsOutreachListClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canCreate = canCreateCampaign(role);
  const isAdmin = role === "ADMIN";

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | CampaignStatus>("");
  const [query, setQuery] = useState("");
  /** Onglet admin discret : marques en attente de contacts CRM. */
  const [listMode, setListMode] = useState<"projets" | "completions">("projets");
  const [awaitingItems, setAwaitingItems] = useState<AwaitingCompletionItem[]>([]);
  const [awaitingLoading, setAwaitingLoading] = useState(false);
  const [awaitingError, setAwaitingError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    mode: "SOLO" as "SOLO" | "MULTI",
    talentId: "",
    talentIds: [] as string[],
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

  const loadAwaiting = useCallback(async () => {
    if (!isAdmin) return;
    setAwaitingLoading(true);
    setAwaitingError(null);
    try {
      const res = await fetch("/api/projets-outreach/awaiting-completions", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger les marques.");
      setAwaitingItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setAwaitingError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setAwaitingLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAwaiting();
  }, [isAdmin, loadAwaiting]);

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
      const payload =
        form.mode === "MULTI"
          ? {
              ...form,
              mode: "MULTI",
              talentIds: form.talentIds,
              talentId: form.talentIds[0] || "",
            }
          : {
              ...form,
              mode: "SOLO",
              talentId: form.talentId,
              talentIds: form.talentId ? [form.talentId] : [],
            };
      const res = await fetch("/api/projets-outreach", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Création impossible.");
      router.push(`/projets-outreach/${data.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  }

  async function resolveAwaiting(item: AwaitingCompletionItem) {
    if (!item.campaignId) return;
    setResolvingId(item.missionId);
    setAwaitingError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${item.campaignId}/resolve-marque-completion`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missionId: item.missionId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Déblocage impossible.");
      setAwaitingItems((prev) => prev.filter((x) => x.missionId !== item.missionId));
    } catch (e) {
      setAwaitingError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setResolvingId(null);
    }
  }

  function onRefresh() {
    if (listMode === "completions") void loadAwaiting();
    else void load();
  }

  return (
    <div className="po-root">
      <div className="po-page">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="po-h1">
              {listMode === "completions"
                ? "Marques à compléter"
                : "Projets outreach talent"}
            </h1>
            <p className="po-sub">
              {listMode === "completions" ? (
                <>
                  Demandes de contacts CRM en attente sur les projets outreach.{" "}
                  <button
                    type="button"
                    className="underline"
                    style={{ color: "var(--po-accent)", font: "inherit" }}
                    onClick={() => setListMode("projets")}
                  >
                    ← Retour projets
                  </button>
                </>
              ) : (
                <>
                  Parcours projet : brief → marques → rédaction → envoi Leyna.{" "}
                  <span style={{ color: "var(--po-muted)" }}>
                    Indépendant du Pipeline Casting.
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="po-btn po-btn-icon"
              onClick={onRefresh}
              aria-label="Rafraîchir"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {canCreate && listMode === "projets" && (
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
          {listMode === "projets" &&
            FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                className={`po-chip ${statusFilter === f.id ? "po-chip-active" : ""}`}
                onClick={() => setStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          {isAdmin && (
            <button
              type="button"
              className={`po-chip ${listMode === "completions" ? "po-chip-active" : ""}`}
              onClick={() => {
                setListMode("completions");
                void loadAwaiting();
              }}
              title="Admin · marques en attente de contacts"
              style={
                listMode === "completions"
                  ? undefined
                  : { borderStyle: "dashed", marginLeft: listMode === "projets" ? 4 : 0 }
              }
            >
              À compléter
              {awaitingItems.length > 0 ? (
                <span className="po-tab-badge" style={{ marginLeft: 6 }}>
                  {awaitingItems.length}
                </span>
              ) : null}
            </button>
          )}
          {listMode === "projets" && (
            <input
              className="po-search ml-auto"
              placeholder="Filtrer par nom, talent…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </div>

        {listMode === "completions" ? (
          <div className="mt-5">
            {awaitingError && (
              <div className="po-card po-card-pad mb-4 text-[13px] text-[var(--po-prio-high-fg)]">
                {awaitingError}
              </div>
            )}
            {awaitingLoading ? (
              <div className="po-empty flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : awaitingItems.length === 0 ? (
              <div className="po-empty">Aucune marque en attente de contacts.</div>
            ) : (
              <div className="po-card" style={{ overflow: "hidden" }}>
                <div
                  className="po-table-head"
                  style={{
                    gridTemplateColumns: "1.4fr 1.2fr 1fr .7fr .9fr auto",
                  }}
                >
                  <div>Marque</div>
                  <div>Projet · talent</div>
                  <div>Demandé</div>
                  <div>Emails</div>
                  <div>Depuis</div>
                  <div />
                </div>
                {awaitingItems.map((item) => (
                  <div
                    key={item.missionId}
                    className="po-table-row"
                    style={{
                      gridTemplateColumns: "1.4fr 1.2fr 1fr .7fr .9fr auto",
                      background: "var(--po-prio-med-bg)",
                      alignItems: "center",
                    }}
                  >
                    <div className="min-w-0">
                      <div style={{ fontWeight: 600, color: "var(--po-ink)" }}>
                        {item.brandName}
                      </div>
                      {!item.marqueId && (
                        <span style={{ fontSize: 11.5, color: "var(--po-muted)" }}>
                          Pas de fiche liée
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      {item.campaignId ? (
                        <Link
                          href={`/projets-outreach/${item.campaignId}`}
                          className="block truncate text-[13px] font-semibold"
                        >
                          {item.campaignTitle || "Projet"}
                        </Link>
                      ) : (
                        <span className="text-[13px]">{item.campaignTitle || "—"}</span>
                      )}
                      <div style={{ fontSize: 12, color: "var(--po-tertiary)" }}>
                        {item.talentName || item.creatorName || "—"}
                      </div>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--po-secondary)" }}>
                      {item.requestedByName || "—"}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {item.emailableCount}
                      <span style={{ fontWeight: 400, color: "var(--po-muted)" }}>
                        {" "}
                        / {item.contactCount}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--po-tertiary)" }}>
                      {formatRelativeFr(item.requestedAt || item.updatedAt)}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {item.marqueId ? (
                        <Link
                          href={`/marques/${item.marqueId}`}
                          className="po-btn po-btn-primary"
                          style={{
                            padding: "5px 10px",
                            fontSize: 11.5,
                            textDecoration: "none",
                          }}
                          title="Ouvrir la fiche marque pour ajouter les contacts"
                        >
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                          À compléter
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="po-btn"
                        style={{ padding: "5px 10px", fontSize: 11.5 }}
                        disabled={resolvingId === item.missionId}
                        onClick={() => void resolveAwaiting(item)}
                        title="Après complétion CRM : débloque la rédaction"
                      >
                        {resolvingId === item.missionId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            Débloquer
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <OutreachWavePanel role={role} />

            <div className="po-kpi-grid my-5">
              {kpis.map((k) => (
                <KpiCard key={k.label} label={k.label} value={k.value} dot={k.dot} hint={k.hint} />
              ))}
            </div>

            {showCreate && canCreate && (
              <form onSubmit={onCreate} className="po-card po-card-pad mb-5 space-y-4">
                <div className="text-[13.5px] font-bold">Nouveau projet</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: "SOLO" as const, label: "Solo", hint: "1 talent" },
                      { id: "MULTI" as const, label: "Multiples", hint: "projet commun" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`po-chip ${form.mode === opt.id ? "po-chip-active" : ""}`}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          mode: opt.id,
                          talentId: opt.id === "SOLO" ? f.talentId : "",
                          talentIds: opt.id === "MULTI" ? f.talentIds : [],
                        }))
                      }
                    >
                      {opt.label}
                      <span style={{ marginLeft: 6, opacity: 0.65, fontSize: 11 }}>
                        {opt.hint}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {form.mode === "SOLO" ? (
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
                  ) : (
                    <div className="block md:col-span-2">
                      <div className="po-field-label">
                        Talents * (min. 2) — {form.talentIds.length} sélectionné
                        {form.talentIds.length > 1 ? "s" : ""}
                      </div>
                      <div
                        className="po-card"
                        style={{
                          maxHeight: 180,
                          overflow: "auto",
                          padding: 10,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {talents.map((t) => {
                          const checked = form.talentIds.includes(t.id);
                          return (
                            <label
                              key={t.id}
                              className="po-chip"
                              style={{
                                cursor: "pointer",
                                opacity: checked ? 1 : 0.55,
                                borderStyle: checked ? "solid" : "dashed",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setForm((f) => ({
                                    ...f,
                                    talentIds: checked
                                      ? f.talentIds.filter((id) => id !== t.id)
                                      : [...f.talentIds, t.id],
                                  }));
                                }}
                                style={{ marginRight: 6 }}
                              />
                              {t.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <label className="block">
                    <div className="po-field-label">Nom du projet *</div>
                    <input
                      required
                      className="po-input"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder={
                        form.mode === "MULTI"
                          ? "Ex. Calendrier de Noël 2026"
                          : "Ex. Shoot Ibiza · Collab beauté"
                      }
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <div className="po-field-label">Description</div>
                    <textarea
                      className="po-textarea"
                      rows={2}
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block">
                    <div className="po-field-label">Objectif</div>
                    <input
                      className="po-input"
                      value={form.objective}
                      onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <div className="po-field-label">Budget</div>
                    <input
                      className="po-input"
                      value={form.budgetRange}
                      onChange={(e) => setForm((f) => ({ ...f, budgetRange: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <div className="po-field-label">Livrables</div>
                    <input
                      className="po-input"
                      value={form.deliverables}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, deliverables: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block">
                    <div className="po-field-label">Timeline</div>
                    <input
                      className="po-input"
                      value={form.timeline}
                      onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <div className="po-field-label">Do&apos;s</div>
                    <input
                      className="po-input"
                      value={form.dos}
                      onChange={(e) => setForm((f) => ({ ...f, dos: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <div className="po-field-label">Don&apos;ts</div>
                    <input
                      className="po-input"
                      value={form.donts}
                      onChange={(e) => setForm((f) => ({ ...f, donts: e.target.value }))}
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <div className="po-field-label">Angles</div>
                    <input
                      className="po-input"
                      value={form.angles}
                      onChange={(e) => setForm((f) => ({ ...f, angles: e.target.value }))}
                    />
                  </label>
                </div>
                {error && (
                  <div className="text-[13px] text-[var(--po-prio-high-fg)]">{error}</div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="po-btn"
                    onClick={() => setShowCreate(false)}
                    disabled={saving}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="po-btn po-btn-primary" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Création…
                      </>
                    ) : (
                      "Créer le projet"
                    )}
                  </button>
                </div>
              </form>
            )}

            {error && !showCreate && (
              <div className="po-card po-card-pad mb-4 text-[13px] text-[var(--po-prio-high-fg)]">
                {error}
              </div>
            )}

            {loading ? (
              <div className="po-empty flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : filtered.length === 0 ? (
              <div className="po-empty">Aucun projet pour ce filtre.</div>
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
                          {c.mode === "MULTI" ? (
                            <span
                              className="po-badge"
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                background: "#EEEAFB",
                                color: "#5B3F9E",
                              }}
                            >
                              Multi · {c.talentCount || c.talents?.length || 0}
                            </span>
                          ) : null}
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
          </>
        )}
      </div>
    </div>
  );
}
