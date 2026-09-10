"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Check,
} from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";
import {
  STATUS_LABEL,
  canEditBrief,
  canManageBrands,
  canDraft,
  canSend,
  canTransitionTo,
  type CampaignStatus,
} from "@/lib/projets-outreach";
import "../po.css";
import {
  KpiCard,
  PoAvatar,
  StageStepper,
  StatusBadge,
  PriorityBadge,
  StageDotBadge,
  initialOf,
} from "../PoUi";

type TabId = "brief" | "marques" | "redaction" | "envois" | "suivi";

type Mission = {
  id: string;
  targetBrand: string;
  marqueId: string | null;
  marqueNom: string | null;
  strategyReason: string;
  recommendedAngle: string | null;
  objective: string | null;
  dos: string | null;
  donts: string | null;
  priority: string;
  status: string;
  stage: string;
  draftEmailSubject: string | null;
  draftEmailBody: string | null;
  clientLanguage?: "FR" | "EN" | null;
  clientContacts: Array<{
    firstname?: string;
    lastname?: string;
    email?: string;
    role?: string;
  }> | null;
  marqueContacts?: Array<{
    id: string;
    firstname: string;
    lastname: string;
    email: string;
    role: string;
    linkedinUrl?: string;
    language?: "fr" | "en";
  }>;
  scheduledSendAt: string | null;
  sentAt: string | null;
  sentMessageIds?: Record<
    string,
    {
      messageId?: string;
      threadId?: string;
      error?: string;
      openCount?: number;
      openedAt?: string;
      lastOpenAt?: string;
      clickCount?: number;
      clickedAt?: string;
      lastClickAt?: string;
      lastClickUrl?: string;
    }
  > | null;
  replied: boolean;
  openedAt: string | null;
  lastOpenAt?: string | null;
  openCount: number;
  clickedAt?: string | null;
  lastClickAt?: string | null;
  lastClickUrl?: string | null;
  clickCount: number;
  relanceSentAt: string | null;
  relance2SentAt: string | null;
  sendError: string | null;
  createdAt: string;
};

function effectiveMissionContacts(m: Mission) {
  // Toujours prioriser la fiche CRM (hors AO) — clientContacts ne sert qu'à
  // mémoriser la sélection d'envoi, pas à masquer les autres contacts.
  const crm = (Array.isArray(m.marqueContacts) ? m.marqueContacts : []).map((c) => ({
    id: c.id,
    firstname: c.firstname,
    lastname: c.lastname,
    email: c.email,
    role: c.role,
    linkedinUrl: c.linkedinUrl || "",
    language: (c.language === "en" ? "en" : "fr") as "fr" | "en",
  }));
  if (crm.length > 0) return crm;

  return Array.isArray(m.clientContacts)
    ? m.clientContacts
        .filter((c) => String(c?.email || "").trim())
        .map((c, index) => ({
          id: `manual-${index}-${String(c.email).trim()}`,
          firstname: String(c.firstname || "").trim(),
          lastname: String(c.lastname || "").trim(),
          email: String(c.email).trim(),
          role: String(c.role || "").trim(),
          linkedinUrl: "",
          language: "fr" as const,
        }))
    : [];
}

function deriveClientLanguage(
  contacts: Array<{ language?: "fr" | "en" }>,
  missionLang?: string | null
): "FR" | "EN" | null {
  const fromMission = String(missionLang || "").toUpperCase();
  if (fromMission === "EN" || fromMission === "FR") return fromMission;
  if (contacts.length === 0) return null;
  const en = contacts.filter((c) => c.language === "en").length;
  return en >= contacts.length / 2 ? "EN" : "FR";
}

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  isActive: boolean;
  senderEmail: string | null;
  objective: string | null;
  deliverables: string | null;
  budgetRange: string | null;
  timeline: string | null;
  dos: string | null;
  donts: string | null;
  angles: string | null;
  talent: { id: string; name: string; photo: string | null; instagram: string | null };
  ownerTmName: string | null;
  createdByName: string;
  events: Array<{
    id: string;
    type: string;
    message: string | null;
    createdAt: string;
    actorName: string;
  }>;
  missions: Mission[];
};

type MarqueHit = { id: string; nom: string; ville: string; contactCount: number };

const TABS: { id: TabId; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "marques", label: "Marques" },
  { id: "redaction", label: "Rédaction" },
  { id: "envois", label: "Envois" },
  { id: "suivi", label: "Suivi" },
];

const NEXT_STATUS: Partial<Record<CampaignStatus, CampaignStatus>> = {
  BRIEF: "BRANDS",
  BRANDS: "DRAFTING",
  DRAFTING: "SENDING",
  SENDING: "ACTIVE",
};

const CTA_LABEL: Partial<Record<CampaignStatus, string>> = {
  BRIEF: "Passer à Inès (marques)",
  BRANDS: "Prêt pour rédaction (Manon)",
  DRAFTING: "Prêt pour envoi (Leyna)",
  SENDING: "Marquer actif",
};

const STAGE_LABEL: Record<string, string> = {
  STRATEGY_DEFINED: "Strategy",
  TO_DRAFT: "À rédiger",
  DRAFTED_FOR_VALIDATION: "À valider",
  TO_SEND: "À envoyer",
  SENT: "Envoyé",
  RESPONSE_RECEIVED: "Réponse",
  IN_NEGOTIATION: "En négo",
  WON: "Gagné",
  LOST: "Perdu",
};

const EMPTY = (
  <span style={{ color: "#C9C9CF" }}>—</span>
);

function activityDotColor(type: string, index: number) {
  if (String(type).toUpperCase().includes("CREATED")) return "#2E9E63";
  if (index < 2) return "#B67C7C";
  return "#C9C9CF";
}

export function ProjetOutreachWorkspace({ campaignId }: { campaignId: string }) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tab, setTab] = useState<TabId>("brief");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaignId}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Projet introuvable.");
      setCampaign(data.campaign);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextStatus = campaign ? NEXT_STATUS[campaign.status] : undefined;
  const canAdvance =
    campaign &&
    nextStatus &&
    canTransitionTo(role, campaign.status, nextStatus);

  async function transition(to: CampaignStatus) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaignId}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Transition impossible.");
      setSuccess(`Étape : ${STATUS_LABEL[to]}`);
      await load();
      if (to === "BRANDS") setTab("marques");
      if (to === "DRAFTING") setTab("redaction");
      if (to === "SENDING" || to === "ACTIVE") setTab("envois");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !campaign) {
    return (
      <div className="po-root" style={{ padding: "40px", color: "var(--po-muted)" }}>
        <div className="inline-flex items-center gap-2 text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du projet…
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="po-root" style={{ padding: "40px" }}>
        <p className="po-alert-error" style={{ marginBottom: 16 }}>
          {error || "Projet introuvable."}
        </p>
        <Link
          href="/projets-outreach"
          className="inline-flex items-center gap-1"
          style={{ fontSize: 12.5, color: "#6E6E77" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Tous les projets
        </Link>
      </div>
    );
  }

  const sender = campaign.senderEmail || "leyna@glowupagence.fr";
  const tmLabel = campaign.ownerTmName || "HORS TM";

  return (
    <div className="po-root">
      <div style={{ borderBottom: "1px solid #EEEEF0", padding: "20px 40px 0" }}>
        <Link
          href="/projets-outreach"
          className="inline-flex items-center gap-1"
          style={{ fontSize: 12.5, color: "#6E6E77", marginBottom: 14 }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Tous les projets
        </Link>

        <div
          className="flex flex-wrap items-start justify-between gap-4"
          style={{ marginBottom: 16 }}
        >
          <div className="flex min-w-0 items-start gap-3">
            <PoAvatar
              name={campaign.talent.name}
              photo={campaign.talent.photo}
              size={40}
            />
            <div className="min-w-0">
              <h1
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--po-ink)",
                }}
              >
                {campaign.title}
              </h1>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: "var(--po-tertiary)",
                  lineHeight: 1.45,
                }}
              >
                Gestion du projet · <strong style={{ color: "var(--po-ink)", fontWeight: 600 }}>{campaign.talent.name}</strong>
                {" · "}envoi {sender}
                {" · "}créé par {campaign.createdByName}
                {" · "}TM {tmLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="po-btn po-btn-icon"
              aria-label="Actualiser"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {canAdvance && nextStatus && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void transition(nextStatus)}
                className="po-btn po-btn-primary"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {CTA_LABEL[campaign.status] || "Avancer"}
              </button>
            )}
            {campaign.status !== "CLOSED" &&
              (canEditBrief(role) || canSend(role)) && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void transition("CLOSED")}
                  className="po-btn po-btn-secondary"
                >
                  Clôturer
                </button>
              )}
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <StageStepper status={campaign.status} />
        </div>

        <div className="po-tabs" style={{ borderBottom: "1px solid #EEEEF0" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`po-tab${tab === t.id ? " po-tab-active" : ""}`}
            >
              {t.label}
              {t.id === "marques" ? (
                <span className="po-tab-badge">{campaign.missions.length}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "24px 40px", maxWidth: 1160, margin: "0 auto" }}>
        {(error || success) && (
          <div
            className={error ? "po-alert-error" : "po-alert-ok"}
            style={{ marginBottom: 16 }}
          >
            {error || success}
          </div>
        )}

        {tab === "brief" && (
          <BriefTab
            campaign={campaign}
            canEdit={canEditBrief(role)}
            onSaved={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "marques" && (
          <MarquesTab
            campaign={campaign}
            canManage={canManageBrands(role)}
            onChanged={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "redaction" && (
          <RedactionTab
            campaign={campaign}
            canEdit={canDraft(role)}
            onChanged={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "envois" && (
          <EnvoisTab
            campaign={campaign}
            canSendMails={canSend(role) || canDraft(role)}
            onChanged={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "suivi" && <SuiviTab campaign={campaign} />}
      </div>
    </div>
  );
}

function BriefTab({
  campaign,
  canEdit,
  onSaved,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const blankForm = useCallback(
    () => ({
      title: campaign.title,
      description: campaign.description || "",
      objective: campaign.objective || "",
      deliverables: campaign.deliverables || "",
      budgetRange: campaign.budgetRange || "",
      timeline: campaign.timeline || "",
      angles: campaign.angles || "",
      dos: campaign.dos || "",
      donts: campaign.donts || "",
    }),
    [campaign]
  );

  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(blankForm());
  }, [blankForm]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaign.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sauvegarde impossible.");
      setSuccess("Brief enregistré.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <form
        onSubmit={onSubmit}
        className="po-card"
        style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <Field label="Titre">
          <input
            disabled={!canEdit}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="po-input"
          />
        </Field>
        <Field label="Description">
          <textarea
            disabled={!canEdit}
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="po-textarea"
          />
        </Field>
        <Field label="Objectif">
          <textarea
            disabled={!canEdit}
            rows={3}
            value={form.objective}
            onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
            className="po-textarea"
          />
        </Field>
        <div className="grid gap-3.5 md:grid-cols-2">
          <Field label="Livrables">
            <textarea
              disabled={!canEdit}
              rows={2}
              value={form.deliverables}
              onChange={(e) => setForm((f) => ({ ...f, deliverables: e.target.value }))}
              className="po-textarea"
              placeholder="Stories, posts, réels…"
            />
          </Field>
          <Field label="Angles">
            <textarea
              disabled={!canEdit}
              rows={2}
              value={form.angles}
              onChange={(e) => setForm((f) => ({ ...f, angles: e.target.value }))}
              className="po-textarea"
              placeholder="Solaire, lifestyle, plage…"
            />
          </Field>
          <Field label="Budget">
            <input
              disabled={!canEdit}
              value={form.budgetRange}
              onChange={(e) => setForm((f) => ({ ...f, budgetRange: e.target.value }))}
              className="po-input"
              placeholder="€"
            />
          </Field>
          <Field label="Timeline">
            <input
              disabled={!canEdit}
              value={form.timeline}
              onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))}
              className="po-input"
              placeholder="16–19 sept."
            />
          </Field>
          <Field label="Do's">
            <textarea
              disabled={!canEdit}
              rows={2}
              value={form.dos}
              onChange={(e) => setForm((f) => ({ ...f, dos: e.target.value }))}
              className="po-textarea"
              placeholder="À faire"
            />
          </Field>
          <Field label="Don'ts">
            <textarea
              disabled={!canEdit}
              rows={2}
              value={form.donts}
              onChange={(e) => setForm((f) => ({ ...f, donts: e.target.value }))}
              className="po-textarea"
              placeholder="À éviter"
            />
          </Field>
        </div>

        {canEdit && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              paddingTop: 16,
              marginTop: 4,
              borderTop: "1px solid #F4F4F5",
            }}
          >
            <button
              type="button"
              className="po-btn po-btn-secondary"
              onClick={() => setForm(blankForm())}
            >
              Annuler
            </button>
            <button type="submit" disabled={saving} className="po-btn po-btn-primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer le brief
            </button>
          </div>
        )}
      </form>

      <aside className="po-card" style={{ padding: 20 }}>
        <div className="flex items-baseline justify-between gap-2" style={{ marginBottom: 14 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--po-ink)",
            }}
          >
            Activité
          </h3>
          <span style={{ fontSize: 11.5, color: "var(--po-muted)", fontWeight: 500 }}>
            Aujourd&apos;hui
          </span>
        </div>
        {campaign.events.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--po-muted)" }}>
            Aucune activité.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {campaign.events.map((e, i) => {
              const color = activityDotColor(e.type, i);
              return (
                <li
                  key={e.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    paddingBottom: i < campaign.events.length - 1 ? 14 : 0,
                    marginBottom: i < campaign.events.length - 1 ? 14 : 0,
                    borderBottom:
                      i < campaign.events.length - 1 ? "1px solid var(--po-sep-soft)" : "none",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      marginTop: 4,
                      borderRadius: 99,
                      background: color,
                      boxShadow: `0 0 0 4px color-mix(in oklab, ${color} 22%, transparent)`,
                      flexShrink: 0,
                    }}
                  />
                  <div className="min-w-0">
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--po-ink)",
                        fontWeight: 500,
                        lineHeight: 1.4,
                      }}
                    >
                      {e.message || e.type}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 11.5,
                        color: "var(--po-muted)",
                      }}
                    >
                      {e.actorName} · {new Date(e.createdAt).toLocaleString("fr-FR")}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}

function MarquesTab({
  campaign,
  canManage,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canManage: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const [crm, setCrm] = useState<MarqueHit[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [reason, setReason] = useState("");
  const [angle, setAngle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [savingId, setSavingId] = useState<string | null>(null);

  const alreadyIds = useMemo(
    () => new Set(campaign.missions.map((m) => m.marqueId).filter(Boolean) as string[]),
    [campaign.missions]
  );
  const alreadyNames = useMemo(
    () =>
      new Set(
        campaign.missions.map((m) =>
          (m.marqueNom || m.targetBrand || "").trim().toLowerCase()
        )
      ),
    [campaign.missions]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCrmLoading(true);
      try {
        const res = await fetch("/api/marques/search", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setCrm(Array.isArray(data.marques) ? data.marques : []);
        }
      } catch {
        if (!cancelled) setCrm([]);
      } finally {
        if (!cancelled) setCrmLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCrm = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return crm;
    return crm.filter(
      (m) =>
        m.nom.toLowerCase().includes(q) ||
        (m.ville || "").toLowerCase().includes(q)
    );
  }, [crm, filter]);

  async function postBrand(item: {
    targetBrand: string;
    marqueId?: string | null;
  }) {
    const res = await fetch(`/api/projets-outreach/${campaign.id}/brands`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            targetBrand: item.targetBrand,
            marqueId: item.marqueId ?? null,
            strategyReason: reason.trim(),
            recommendedAngle: angle.trim() || null,
            priority,
            clientContacts: null,
          },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Ajout impossible.");
    return data;
  }

  async function addFromCrm(hit: MarqueHit) {
    if (!canManage || savingId) return;
    if (alreadyIds.has(hit.id) || alreadyNames.has(hit.nom.trim().toLowerCase())) {
      setError(`${hit.nom} est déjà dans le projet.`);
      return;
    }
    setSavingId(hit.id);
    setError(null);
    try {
      await postBrand({ targetBrand: hit.nom, marqueId: hit.id });
      setSuccess(`${hit.nom} ajoutée.`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  async function addManual(e: FormEvent) {
    e.preventDefault();
    if (!canManage || savingId) return;
    const targetBrand = manualBrand.trim();
    if (!targetBrand) {
      setError("Le nom de la marque est requis.");
      return;
    }
    if (alreadyNames.has(targetBrand.toLowerCase())) {
      setError(`${targetBrand} est déjà dans le projet.`);
      return;
    }
    setSavingId("__manual__");
    setError(null);
    try {
      await postBrand({ targetBrand, marqueId: null });
      setSuccess(`${targetBrand} ajoutée.`);
      setManualBrand("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  async function removeMission(missionId: string) {
    if (!canManage || savingId) return;
    if (!confirm("Retirer cette marque du projet ?")) return;
    setSavingId(missionId);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaign.id}/brands`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      setSuccess("Marque retirée.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  const tableCols = "1.1fr 2.2fr .8fr .7fr 36px";
  const busy = Boolean(savingId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {canManage && (
        <div className="po-card" style={{ padding: 18 }}>
          <div
            className="flex flex-wrap items-start justify-between gap-3"
            style={{ marginBottom: 12 }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--po-ink)",
                }}
              >
                CRM Marques
              </h3>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: "var(--po-tertiary)",
                }}
              >
                Parcours le CRM et clique Ajouter autant de fois que besoin
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Priorité">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="po-select"
                  style={{ minWidth: 120 }}
                >
                  <option value="MEDIUM">Moyenne</option>
                  <option value="HIGH">Haute</option>
                  <option value="LOW">Basse</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2" style={{ marginBottom: 12 }}>
            <Field label="Raison strategy (appliquée aux prochains ajouts)">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="po-input"
                placeholder="Optionnel — réutilisée à chaque Ajouter"
              />
            </Field>
            <Field label="Angle recommandé (optionnel)">
              <input
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                className="po-input"
                placeholder="Optionnel"
              />
            </Field>
          </div>

          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--po-muted)" }}
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer le CRM…"
              className="po-input"
              style={{ paddingLeft: 36 }}
            />
          </div>

          <div
            className="po-card"
            style={{
              maxHeight: 360,
              overflow: "auto",
              borderRadius: 12,
              background: "var(--po-surface)",
            }}
          >
            {crmLoading ? (
              <div
                className="flex items-center gap-2"
                style={{ padding: 16, fontSize: 13, color: "var(--po-muted)" }}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du CRM…
              </div>
            ) : filteredCrm.length === 0 ? (
              <div className="po-empty" style={{ border: "none", padding: 24 }}>
                {crm.length === 0
                  ? "Aucune marque dans le CRM."
                  : "Aucun résultat pour ce filtre."}
              </div>
            ) : (
              filteredCrm.map((h) => {
                const already =
                  alreadyIds.has(h.id) || alreadyNames.has(h.nom.trim().toLowerCase());
                const rowBusy = savingId === h.id;
                return (
                  <div
                    key={h.id}
                    className="flex items-center gap-3"
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--po-sep-soft)",
                      background: already ? "transparent" : "var(--po-white)",
                    }}
                  >
                    <PoAvatar name={h.nom} size={28} />
                    <div className="min-w-0 flex-1">
                      <div style={{ fontWeight: 600, color: "var(--po-ink)" }}>{h.nom}</div>
                      <div style={{ fontSize: 11.5, color: "var(--po-muted)" }}>
                        {h.contactCount} contact{h.contactCount === 1 ? "" : "s"}
                        {h.ville ? ` · ${h.ville}` : ""}
                      </div>
                    </div>
                    {already ? (
                      <span
                        className="po-badge po-badge-stage"
                        style={{ fontSize: 11 }}
                      >
                        Déjà ajoutée
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void addFromCrm(h)}
                        className="po-btn po-btn-primary"
                        style={{ padding: "6px 12px", fontSize: 12.5 }}
                      >
                        {rowBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Ajouter
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={addManual}
            className="flex flex-wrap items-end gap-2"
            style={{ marginTop: 12 }}
          >
            <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
              <Field label="Pas dans le CRM ? Saisie libre">
                <input
                  value={manualBrand}
                  onChange={(e) => setManualBrand(e.target.value)}
                  className="po-input"
                  placeholder="Nouvelle marque"
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={busy || !manualBrand.trim()}
              className="po-btn po-btn-secondary"
            >
              {savingId === "__manual__" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Ajouter libre
            </button>
          </form>
        </div>
      )}

      <div className="po-card" style={{ overflow: "hidden" }}>
        <div
          className="flex items-center justify-between"
          style={{ padding: "12px 22px", borderBottom: "1px solid var(--po-sep)" }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--po-ink)" }}>
            Dans ce projet ({campaign.missions.length})
          </span>
        </div>
        <div className="po-table-head" style={{ gridTemplateColumns: tableCols }}>
          <span>Marque</span>
          <span>Raison</span>
          <span>Stage</span>
          <span>Priorité</span>
          <span />
        </div>
        {campaign.missions.length === 0 ? (
          <div className="po-empty" style={{ border: "none", borderRadius: 0 }}>
            Aucune marque pour l&apos;instant — ajoute-les depuis le CRM ci-dessus.
          </div>
        ) : (
          campaign.missions.map((m) => {
            const name = m.marqueNom || m.targetBrand;
            return (
              <div
                key={m.id}
                className="po-table-row"
                style={{ gridTemplateColumns: tableCols }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <PoAvatar name={name} size={26} />
                  <div className="min-w-0">
                    <div style={{ fontWeight: 600, color: "var(--po-ink)" }}>{name}</div>
                    {m.marqueId && (
                      <Link href={`/marques/${m.marqueId}`} style={{ fontSize: 11.5 }}>
                        fiche
                      </Link>
                    )}
                  </div>
                </div>
                <div
                  className="truncate"
                  style={{ color: "var(--po-secondary)" }}
                  title={m.strategyReason}
                >
                  {m.strategyReason || EMPTY}
                </div>
                <div>
                  <StageDotBadge label={STAGE_LABEL[m.stage] || m.stage} />
                </div>
                <div>
                  <PriorityBadge priority={m.priority} />
                </div>
                <div style={{ textAlign: "right" }}>
                  {canManage && !m.sentAt && (
                    <button
                      type="button"
                      onClick={() => void removeMission(m.id)}
                      aria-label="Retirer"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--po-muted)",
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                        padding: 4,
                        borderRadius: 6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#E5484D";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--po-muted)";
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RedactionTab({
  campaign,
  canEdit,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const draftable = useMemo(
    () =>
      campaign.missions.filter(
        (m) =>
          m.stage === "TO_DRAFT" ||
          m.stage === "DRAFTED_FOR_VALIDATION" ||
          m.stage === "STRATEGY_DEFINED" ||
          m.stage === "TO_SEND"
      ),
    [campaign.missions]
  );

  type ComposerContact = {
    company: string;
    contacts: Array<{
      id: string;
      firstname: string;
      lastname: string;
      email: string;
      role?: string;
      linkedinUrl?: string;
    }>;
    initialSubject?: string;
    initialBodyHtml?: string;
    missionBrief: {
      id: string;
      creatorName: string;
      targetBrand: string;
      strategyReason: string;
      recommendedAngle?: string | null;
      objective?: string | null;
      dos?: string | null;
      donts?: string | null;
      priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      status: "READY_FOR_CASTING" | "EMAIL_DRAFTED" | "APPROVED_BY_SALES" | "SENT" | "CANCELLED";
      clientLanguage?: "FR" | "EN" | null;
      clientContacts?: Array<{
        firstname?: string;
        lastname?: string;
        email?: string;
        role?: string;
      }> | null;
      projectTitle?: string | null;
      projectDescription?: string | null;
      deliverables?: string | null;
      angles?: string | null;
      timeline?: string | null;
      budgetRange?: string | null;
    };
  };

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContact, setComposerContact] = useState<ComposerContact | null>(null);
  const [busy, setBusy] = useState(false);

  async function openComposer(m: Mission) {
    let localContacts = effectiveMissionContacts(m);

    // Recharge live depuis le CRM (évite le bug Prisma NOT source=AO qui
    // excluait aussi source null → 0 contacts type Nuxe).
    const brand = (m.marqueNom || m.targetBrand || "").trim();
    if (brand.length >= 2) {
      try {
        const res = await fetch(
          `/api/marques/contacts?brand=${encodeURIComponent(brand)}`,
          { credentials: "include" }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.contacts)) {
          const live = (data.contacts as Array<{
            id?: string;
            firstname?: string;
            lastname?: string;
            email?: string;
            role?: string;
            language?: string;
          }>)
            .map((c) => ({
              id: String(c.id || "").trim(),
              firstname: String(c.firstname || "").trim(),
              lastname: String(c.lastname || "").trim(),
              email: String(c.email || "").trim(),
              role: String(c.role || "").trim(),
              linkedinUrl: "",
              language: (String(c.language || "").toLowerCase() === "en"
                ? "en"
                : "fr") as "fr" | "en",
            }))
            .filter((c) => c.id && c.email.includes("@"));
          if (live.length > 0) localContacts = live;
        }
      } catch {
        // garde le snapshot campagne
      }
    }

    const priority = (["LOW", "MEDIUM", "HIGH", "URGENT"].includes(m.priority)
      ? m.priority
      : "MEDIUM") as ComposerContact["missionBrief"]["priority"];
    const status = (
      ["READY_FOR_CASTING", "EMAIL_DRAFTED", "APPROVED_BY_SALES", "SENT", "CANCELLED"].includes(
        m.status
      )
        ? m.status
        : "READY_FOR_CASTING"
    ) as ComposerContact["missionBrief"]["status"];

    setComposerContact({
      company: m.marqueNom || m.targetBrand,
      contacts: localContacts.map((c) => ({
        id: c.id,
        firstname: c.firstname,
        lastname: c.lastname,
        email: c.email,
        role: c.role,
        linkedinUrl: c.linkedinUrl,
        language: c.language,
      })),
      initialSubject: String(m.draftEmailSubject || "").trim(),
      initialBodyHtml: String(m.draftEmailBody || "").trim(),
      missionBrief: {
        id: m.id,
        creatorName: campaign.talent.name,
        targetBrand: m.targetBrand,
        strategyReason: m.strategyReason,
        recommendedAngle: m.recommendedAngle,
        objective: m.objective || campaign.objective,
        dos: m.dos || campaign.dos,
        donts: m.donts || campaign.donts,
        priority,
        status,
        clientLanguage: deriveClientLanguage(localContacts, m.clientLanguage),
        clientContacts: localContacts,
        projectTitle: campaign.title,
        projectDescription: campaign.description,
        deliverables: campaign.deliverables,
        angles: campaign.angles,
        timeline: campaign.timeline,
        budgetRange: campaign.budgetRange,
      },
    });
    setComposerOpen(true);
  }

  async function patchMission(
    missionId: string,
    payload: Record<string, unknown>
  ) {
    const res = await fetch("/api/strategy/contact-missions", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missionId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Sauvegarde impossible.");
  }

  async function handleComposerSaved(
    status: "pret" | "en_cours" | "reset",
    draft?: {
      subject: string;
      bodyHtml: string;
      language?: "fr" | "en";
      scheduledAt?: string | null;
      selectedContacts?: Array<{
        id: string;
        firstname: string;
        lastname: string;
        email: string;
        role?: string;
        linkedinUrl?: string;
      }>;
    },
    ctx?: {
      setProgress: (progress: { label: string; percent: number } | null) => void;
    }
  ) {
    const missionId = composerContact?.missionBrief?.id;
    if (!missionId || !canEdit) return;
    setBusy(true);
    setError(null);
    const setProgress = ctx?.setProgress;
    try {
      const draftLanguage: "fr" | "en" = draft?.language === "en" ? "en" : "fr";
      const selected = Array.isArray(draft?.selectedContacts)
        ? draft.selectedContacts.filter((c) => String(c.email || "").trim())
        : [];

      if (status === "en_cours") {
        setProgress?.({ label: "Enregistrement du brouillon…", percent: 55 });
        await patchMission(missionId, {
          stage: "TO_DRAFT",
          status: "EMAIL_DRAFTED",
          draftEmailSubject: draft?.subject ?? "",
          draftEmailBody: draft?.bodyHtml ?? "",
          draftLanguage,
          ...(selected.length > 0
            ? {
                clientContacts: selected.map((c) => ({
                  firstname: c.firstname,
                  lastname: c.lastname,
                  email: c.email,
                  role: c.role || "",
                })),
              }
            : {}),
        });
        setProgress?.({ label: "Brouillon enregistré", percent: 100 });
        setSuccess("Brouillon enregistré.");
        setComposerOpen(false);
        await onChanged();
        return;
      }

      if (status === "pret") {
        if (selected.length === 0) {
          throw new Error(
            "Aucun destinataire sélectionné. Coche au moins un contact de la fiche marque."
          );
        }

        setProgress?.({
          label: `Sauvegarde du mail (${selected.length} destinataire${selected.length > 1 ? "s" : ""})…`,
          percent: 20,
        });
        await patchMission(missionId, {
          stage: "DRAFTED_FOR_VALIDATION",
          status: "EMAIL_DRAFTED",
          draftEmailSubject: draft?.subject ?? "",
          draftEmailBody: draft?.bodyHtml ?? "",
          draftLanguage,
          clientContacts: selected.map((c) => ({
            firstname: c.firstname,
            lastname: c.lastname,
            email: c.email,
            role: c.role || "",
          })),
        });

        setProgress?.({ label: "Planification de l'envoi Leyna…", percent: 45 });
        const scheduleRes = await fetch(
          `/api/strategy/contact-missions/${missionId}/schedule-send`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        const scheduleData = await scheduleRes.json().catch(() => ({}));
        if (!scheduleRes.ok) {
          throw new Error(scheduleData.error || "Planification impossible.");
        }

        setProgress?.({
          label: `Envoi en cours via Leyna (${selected.length} contact${selected.length > 1 ? "s" : ""})…`,
          percent: 72,
        });
        const sendRes = await fetch(
          `/api/strategy/contact-missions/${missionId}/send-now`,
          {
            method: "POST",
            credentials: "include",
          }
        );
        const sendData = (await sendRes.json().catch(() => ({}))) as {
          error?: string;
          succeeded?: number;
        };
        if (!sendRes.ok) throw new Error(sendData.error || "Envoi impossible.");

        setProgress?.({
          label: `Envoyé (${sendData.succeeded ?? 0}/${selected.length})`,
          percent: 100,
        });
        setSuccess(
          `Envoyé depuis Leyna (${sendData.succeeded ?? 0} destinataire(s)).`
        );
        setComposerOpen(false);
        await onChanged();
      }
    } catch (err) {
      setProgress?.(null);
      setError(err instanceof Error ? err.message : "Erreur");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  if (draftable.length === 0) {
    return (
      <div className="po-empty">
        Aucune marque à rédiger. Inès doit d&apos;abord ajouter des marques.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="po-card" style={{ overflow: "hidden" }}>
        <div
          className="po-table-head"
          style={{
            gridTemplateColumns: "minmax(140px,1.2fr) minmax(0,2fr) 120px 100px 140px",
          }}
        >
          <span>Marque</span>
          <span>Raison</span>
          <span>Statut</span>
          <span>Priorité</span>
          <span />
        </div>
        {draftable.map((m) => {
          const contactCount = effectiveMissionContacts(m).length;
          const name = m.marqueNom || m.targetBrand;
          return (
            <div
              key={m.id}
              className="po-table-row"
              style={{
                gridTemplateColumns: "minmax(140px,1.2fr) minmax(0,2fr) 120px 100px 140px",
              }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PoAvatar name={name} size={26} />
                <span style={{ fontWeight: 600, color: "var(--po-ink)" }} className="truncate">
                  {name}
                </span>
              </div>
              <div
                className="truncate"
                style={{ color: "var(--po-tertiary)", fontSize: 12.5 }}
                title={m.strategyReason || undefined}
              >
                {m.strategyReason || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--po-tertiary)" }}>
                <StageDotBadge label={STAGE_LABEL[m.stage] || m.stage} />
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--po-muted)" }}>
                  {contactCount} contact(s)
                </div>
              </div>
              <div>
                <PriorityBadge priority={m.priority} />
              </div>
              <div className="flex justify-end">
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openComposer(m)}
                    className="po-btn po-btn-primary po-btn-cta-accent"
                    style={{ padding: "7px 12px", fontSize: 12 }}
                  >
                    {m.draftEmailSubject ? "Ouvrir" : "Rédiger"}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "#956A15" }}>Casting</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CastingComposer
        open={composerOpen}
        contact={composerContact}
        brandColumn="todo"
        useHubspot={false}
        allowSchedule={false}
        lockedTalentId={campaign.talent.id}
        readyLabel="Envoyer depuis Leyna"
        onClose={() => {
          setComposerOpen(false);
          setComposerContact(null);
        }}
        onSaved={(status, draft, ctx) => handleComposerSaved(status, draft, ctx)}
        onError={(msg) => setError(msg)}
        onSuccess={(msg) => setSuccess(msg)}
      />
    </div>
  );
}

function EnvoisTab({
  campaign,
  canSendMails,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canSendMails: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const queue = campaign.missions.filter(
    (m) =>
      m.stage === "DRAFTED_FOR_VALIDATION" ||
      m.stage === "TO_SEND" ||
      (m.scheduledSendAt && !m.sentAt)
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function scheduleAndSend(missionId: string) {
    if (!canSendMails) return;
    setBusyId(missionId);
    setError(null);
    try {
      const scheduleRes = await fetch(
        `/api/strategy/contact-missions/${missionId}/schedule-send`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const scheduleData = await scheduleRes.json().catch(() => ({}));
      if (!scheduleRes.ok) {
        throw new Error(scheduleData.error || "Planification impossible.");
      }

      const sendRes = await fetch(`/api/strategy/contact-missions/${missionId}/send-now`, {
        method: "POST",
        credentials: "include",
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) throw new Error(sendData.error || "Envoi impossible.");

      setSuccess(
        `Envoyé depuis Leyna (${sendData.succeeded ?? 0} destinataire(s)).`
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return (
      <div className="po-empty" style={{ padding: 56 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--po-accent-14)",
            color: "var(--po-accent)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 14px",
          }}
        >
          <Send className="h-5 w-5" />
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--po-ink)",
            marginBottom: 6,
          }}
        >
          Rien en file d&apos;envoi
        </div>
        <div style={{ fontSize: 13, color: "var(--po-muted)", maxWidth: 360, margin: "0 auto" }}>
          Les mails rédigés et validés apparaîtront ici avant leur départ.
        </div>
      </div>
    );
  }

  const cols = "1.2fr 1.6fr 1.4fr .9fr auto";

  return (
    <div className="po-card" style={{ overflow: "hidden" }}>
      <div className="po-table-head" style={{ gridTemplateColumns: cols }}>
        <span>Marque</span>
        <span>Objet</span>
        <span>Contacts</span>
        <span>Stage</span>
        <span />
      </div>
      {queue.map((m) => {
        const contacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
        return (
          <div key={m.id} className="po-table-row" style={{ gridTemplateColumns: cols }}>
            <div style={{ fontWeight: 600 }}>{m.marqueNom || m.targetBrand}</div>
            <div className="truncate">{m.draftEmailSubject || EMPTY}</div>
            <div className="truncate" style={{ fontSize: 12, color: "var(--po-secondary)" }}>
              {contacts.map((c) => c.email).filter(Boolean).join(", ") || EMPTY}
            </div>
            <div>
              <StageDotBadge label={STAGE_LABEL[m.stage] || m.stage} />
            </div>
            <div style={{ textAlign: "right" }}>
              {canSendMails && (
                <button
                  type="button"
                  disabled={busyId === m.id}
                  onClick={() => void scheduleAndSend(m.id)}
                  className="po-btn po-btn-primary"
                  style={{ padding: "7px 12px", fontSize: 12 }}
                >
                  {busyId === m.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Envoyer
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SuiviTab({ campaign }: { campaign: Campaign }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const contacted = campaign.missions.filter(
    (m) =>
      m.sentAt ||
      m.stage === "SENT" ||
      m.stage === "RESPONSE_RECEIVED" ||
      m.stage === "IN_NEGOTIATION" ||
      m.stage === "WON" ||
      m.stage === "LOST"
  );

  const opens = campaign.missions.reduce((n, m) => n + (m.openCount || 0), 0);
  const replies = campaign.missions.filter(
    (m) =>
      m.replied ||
      m.stage === "RESPONSE_RECEIVED" ||
      m.stage === "IN_NEGOTIATION" ||
      m.stage === "WON"
  ).length;

  const cols = "1.4fr 1fr .8fr .6fr .6fr .8fr .8fr";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="po-kpi-grid">
        <KpiCard label="Marques" value={campaign.missions.length} dot="#B67C7C" />
        <KpiCard label="Contactées" value={contacted.length} dot="#C45C26" />
        <KpiCard label="Ouvertures" value={opens} dot="#2F6FED" />
        <KpiCard label="Réponses" value={replies} dot="#2E9E63" />
      </div>

      <div className="po-card" style={{ overflow: "hidden" }}>
        <div className="po-table-head" style={{ gridTemplateColumns: cols }}>
          <span>Marque</span>
          <span>Stage</span>
          <span>Envoyé</span>
          <span>Opens</span>
          <span>Clics</span>
          <span>Relances</span>
          <span>Erreur</span>
        </div>
        {campaign.missions.length === 0 ? (
          <div className="po-empty" style={{ border: "none", borderRadius: 0 }}>
            Pas encore de suivi.
          </div>
        ) : (
          campaign.missions.map((m) => {
            const relances = [m.relanceSentAt && "J+3", m.relance2SentAt && "J+10"]
              .filter(Boolean)
              .join(" · ");
            const recipients = Object.entries(m.sentMessageIds || {})
              .filter(([, rec]) => Boolean(rec?.messageId) && !rec?.error)
              .map(([email, rec]) => ({ email, ...rec }))
              .sort((a, b) => a.email.localeCompare(b.email, "fr"));
            const hasPerEmailDetail = recipients.some(
              (r) => (r.openCount || 0) > 0 || (r.clickCount || 0) > 0
            );
            const canExpand =
              recipients.length > 0 || m.openCount > 0 || m.clickCount > 0 || Boolean(m.lastClickUrl);
            const isOpen = expandedId === m.id;

            return (
              <div key={m.id}>
                <button
                  type="button"
                  className="po-table-row"
                  style={{
                    gridTemplateColumns: cols,
                    width: "100%",
                    textAlign: "left",
                    cursor: canExpand ? "pointer" : "default",
                    background: isOpen ? "var(--po-surface)" : "transparent",
                    border: "none",
                    font: "inherit",
                    color: "inherit",
                  }}
                  onClick={() => {
                    if (!canExpand) return;
                    setExpandedId((prev) => (prev === m.id ? null : m.id));
                  }}
                  disabled={!canExpand}
                >
                  <div style={{ fontWeight: 600 }}>{m.marqueNom || m.targetBrand}</div>
                  <div>
                    <StageDotBadge label={STAGE_LABEL[m.stage] || m.stage} />
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {m.sentAt ? new Date(m.sentAt).toLocaleString("fr-FR") : EMPTY}
                  </div>
                  <div>{m.openCount}</div>
                  <div style={{ fontWeight: m.clickCount > 0 ? 600 : undefined }}>
                    {m.clickCount}
                    {canExpand ? (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "var(--po-muted)" }}>
                        {isOpen ? "▲" : "▼"}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12 }}>{relances || EMPTY}</div>
                  <div
                    className="truncate"
                    style={{ fontSize: 12, color: m.sendError ? "var(--po-danger)" : undefined }}
                    title={m.sendError || undefined}
                  >
                    {m.sendError || EMPTY}
                  </div>
                </button>
                {isOpen && (
                  <div
                    style={{
                      padding: "10px 16px 14px",
                      borderBottom: "1px solid var(--po-sep)",
                      background: "var(--po-surface)",
                      fontSize: 12.5,
                    }}
                  >
                    {recipients.length === 0 ? (
                      <p style={{ margin: 0, color: "var(--po-tertiary)" }}>
                        Aucun destinataire enregistré sur cet envoi.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "var(--po-muted)",
                          }}
                        >
                          Destinataires
                          {!hasPerEmailDetail && (m.openCount > 0 || m.clickCount > 0)
                            ? " · détail par mail dispo après les prochains envois"
                            : ""}
                        </div>
                        {recipients.map((r) => {
                          const opened = (r.openCount || 0) > 0;
                          const clicked = (r.clickCount || 0) > 0;
                          return (
                            <div
                              key={r.email}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1.4fr) auto auto minmax(0, 1.6fr)",
                                gap: 10,
                                alignItems: "center",
                              }}
                            >
                              <span
                                className="truncate"
                                style={{ fontWeight: 500, color: "var(--po-ink)" }}
                                title={r.email}
                              >
                                {r.email}
                              </span>
                              <span
                                style={{
                                  color: opened ? "#2F6FED" : "var(--po-muted)",
                                  fontWeight: opened ? 600 : 400,
                                }}
                              >
                                {opened ? `Ouvert ${r.openCount}×` : "Pas d’ouverture"}
                              </span>
                              <span
                                style={{
                                  color: clicked ? "#C45C26" : "var(--po-muted)",
                                  fontWeight: clicked ? 600 : 400,
                                }}
                              >
                                {clicked ? `Clic ${r.clickCount}×` : "Pas de clic"}
                              </span>
                              <span className="truncate" style={{ color: "var(--po-tertiary)" }}>
                                {r.lastClickUrl ? (
                                  <a
                                    href={r.lastClickUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "var(--po-accent)", textDecoration: "underline" }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {r.lastClickUrl}
                                  </a>
                                ) : (
                                  EMPTY
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!hasPerEmailDetail && m.lastClickUrl ? (
                      <p style={{ margin: "10px 0 0", color: "var(--po-tertiary)" }}>
                        Dernier lien cliqué (marque) :{" "}
                        <a
                          href={m.lastClickUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--po-accent)", textDecoration: "underline" }}
                        >
                          {m.lastClickUrl}
                        </a>
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <div className="po-field-label">{label}</div>
      {children}
    </label>
  );
}
