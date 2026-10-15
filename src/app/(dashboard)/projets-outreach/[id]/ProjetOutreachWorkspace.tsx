"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Check,
  ExternalLink,
  FileText,
  Eye,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";
import {
  STATUS_LABEL,
  canEditBrief,
  canManagePresentation,
  canManageBrands,
  canDraft,
  canSend,
  canTransitionTo,
  bypassesWaveCastingGate,
  canManagePrestatairesOnCampaign,
  canEditPrestataireLine,
  needsPrestataires,
  formatResponsableValue,
  PRESTATAIRE_CATEGORIES,
  PRESTATAIRE_CATEGORIE_LABEL,
  type CampaignStatus,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";
import { businessDaysAfter } from "@/lib/business-days";
import { MesPrestatairesPanel } from "../MesPrestatairesPanel";
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

type TabId =
  | "brief"
  | "prestas"
  | "marques"
  | "redaction"
  | "envois"
  | "suivi"
  | "a-completer";

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
  awaitingContactsCompletion?: boolean;
  contactsCompletionRequestedAt?: string | null;
  /** SOLO : déjà contactée ailleurs — bloquée jusqu’à cette date. */
  brandCooldownUntil?: string | null;
  brandCooldownReason?: string | null;
  selectedTalentIds?: string[];
  condensationGroupId?: string | null;
  condensationRole?: "PRIMARY" | "MEMBER" | null;
  condensationStatus?: string | null;
  condensationPeerNames?: string[];
  waveClusterId?: string | null;
  relanceSentAt: string | null;
  relance2SentAt: string | null;
  relanceCancelledAt?: string | null;
  sendError: string | null;
  createdAt: string;
};

function brandCooldownActive(m: Mission, now: Date = new Date()): boolean {
  if (!m.brandCooldownUntil) return false;
  const t = new Date(m.brandCooldownUntil);
  return !Number.isNaN(t.getTime()) && t.getTime() > now.getTime();
}

type CachedBrandResearch = {
  recentCampaigns: string;
  newProducts: string;
  availabilityFrEu?: string;
  brandPositioning: string;
  influenceStrategy: string;
};

type CachedTalentResearchItem = {
  talentId: string;
  name: string;
  whoTheyAre: string;
  whatTheyDo?: string;
  profileAnalysis?: string;
  contentThemes: string;
  whyRelevant: string;
  proofPoints: string;
  sourcesUsed?: string;
};

/** Clé cache stable : ignore casse, accents, espaces (JouéClub ≈ Joué club). */
function brandResearchKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Variantes de clé (nouveau + anciens caches sessionStorage). */
function brandResearchKeys(name: string): string[] {
  const trimmed = String(name || "").trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const noSpace = lower.replace(/\s+/g, "");
  const normalized = brandResearchKey(trimmed);
  return Array.from(new Set([normalized, lower, noSpace].filter(Boolean)));
}

/** Cherche dans le cache sous plusieurs libellés (marqueNom / targetBrand / company). */
function lookupBrandCache<T>(
  cache: Record<string, T>,
  ...names: Array<string | null | undefined>
): T | null {
  for (const n of names) {
    for (const key of brandResearchKeys(String(n || ""))) {
      if (key && cache[key] != null) return cache[key];
    }
  }
  return null;
}

function hasBrandCacheEntry(
  cache: Record<string, unknown>,
  ...names: Array<string | null | undefined>
): boolean {
  return lookupBrandCache(cache, ...names) != null;
}

function loadJsonCache<T>(storageKey: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, T>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveJsonCache<T>(storageKey: string, cache: Record<string, T>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(cache));
  } catch {
    // quota / private mode
  }
}

function loadBrandResearchCache(campaignId: string) {
  return loadJsonCache<CachedBrandResearch>(`po-brand-research:${campaignId}`);
}

function saveBrandResearchCache(
  campaignId: string,
  cache: Record<string, CachedBrandResearch>
) {
  saveJsonCache(`po-brand-research:${campaignId}`, cache);
}

function loadTalentResearchCache(campaignId: string) {
  return loadJsonCache<CachedTalentResearchItem[]>(
    `po-talent-research:${campaignId}`
  );
}

function saveTalentResearchCache(
  campaignId: string,
  cache: Record<string, CachedTalentResearchItem[]>
) {
  saveJsonCache(`po-talent-research:${campaignId}`, cache);
}

type CachedLeynaExchange = {
  hasExchange: boolean;
  tone?: "tu" | "vous" | null;
  bannerLabel?: string | null;
  contacts?: Array<{
    email: string;
    subject?: string | null;
    tone?: "tu" | "vous" | null;
    notes?: string;
    lastExchangeAt?: string | null;
  }>;
};

/** v2 : ignore anciens faux « aucun échange » (fils Glow Up internes comptés à tort). */
function loadLeynaExchangeCache(campaignId: string) {
  return loadJsonCache<CachedLeynaExchange>(`po-leyna-exchange:v2:${campaignId}`);
}

function saveLeynaExchangeCache(
  campaignId: string,
  cache: Record<string, CachedLeynaExchange>
) {
  saveJsonCache(`po-leyna-exchange:v2:${campaignId}`, cache);
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
}

function brandCooldownLabel(m: Mission): string {
  if (!m.brandCooldownUntil) return "";
  const t = new Date(m.brandCooldownUntil);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
  const fromCrm = crm.filter(
    (c) => c.email && !c.email.toLowerCase().endsWith("@glowupagence.fr")
  );
  if (fromCrm.length > 0) return fromCrm;

  return Array.isArray(m.clientContacts)
    ? m.clientContacts
        .filter((c) => {
          const email = String(c?.email || "").trim();
          return (
            email.includes("@") && !email.toLowerCase().endsWith("@glowupagence.fr")
          );
        })
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

type Prestataire = {
  id: string;
  nom: string;
  categorie: PrestataireCategorie | string;
  statut?: string;
  notes?: string | null;
  contactInfo?: string | null;
  prestataireCrmId?: string | null;
  responsableId: string | null;
  responsableTalentId?: string | null;
  responsableKind?: "USER" | "TALENT";
  responsableName: string;
  responsableRole?: string | null;
};

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  mode?: "SOLO" | "MULTI";
  isActive: boolean;
  senderEmail: string | null;
  objective: string | null;
  deliverables: string | null;
  budgetRange: string | null;
  timeline: string | null;
  dos: string | null;
  donts: string | null;
  angles: string | null;
  necessitePrestataires: boolean;
  lieu: string | null;
  presentationPdfUrl?: string | null;
  presentationFileName?: string | null;
  presentationUploadedAt?: string | null;
  includePresentationInEmails?: boolean;
  ownerTmId?: string | null;
  createdById?: string;
  talent: { id: string; name: string; photo: string | null; instagram: string | null };
  talents?: Array<{
    id: string;
    name: string;
    prenom?: string;
    nom?: string;
    photo: string | null;
    instagram?: string | null;
    niches?: string[];
    igFollowers?: number;
    ttFollowers?: number;
    note?: string | null;
  }>;
  talentCount?: number;
  ownerTmName: string | null;
  createdByName: string;
  waveId?: string | null;
  wave?: {
    id: string;
    title: string;
    status: "COLLECTING" | "REVIEWING_CONDENSATIONS" | "OPEN_FOR_DRAFTING" | "CLOSED";
    completedAt?: string | null;
    validatedAt?: string | null;
  } | null;
  events: Array<{
    id: string;
    type: string;
    message: string | null;
    createdAt: string;
    actorName: string;
  }>;
  missions: Mission[];
  prestataires?: Prestataire[];
};

type MarqueHit = { id: string; nom: string; ville: string; contactCount: number };

const TABS: { id: TabId; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "prestas", label: "Prospection presta" },
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
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const isAdmin = role === "ADMIN";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tab, setTab] = useState<TabId>("brief");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [presentationPreviewOpen, setPresentationPreviewOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (
      t === "brief" ||
      t === "prestas" ||
      t === "marques" ||
      t === "redaction" ||
      t === "envois" ||
      t === "suivi" ||
      t === "a-completer"
    ) {
      setTab(t);
    }
  }, []);

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
  const awaitingContactsCount =
    campaign?.missions.filter((m) => m.awaitingContactsCompletion).length || 0;
  const canAdvance =
    campaign &&
    nextStatus &&
    canTransitionTo(role, campaign.status, nextStatus) &&
    !(
      awaitingContactsCount > 0 &&
      (nextStatus === "DRAFTING" || nextStatus === "SENDING")
    ) &&
    !(
      !bypassesWaveCastingGate(role) &&
      campaign.wave &&
      (campaign.wave.status === "COLLECTING" ||
        campaign.wave.status === "REVIEWING_CONDENSATIONS") &&
      (nextStatus === "DRAFTING" || nextStatus === "SENDING")
    );

  async function transition(to: CampaignStatus) {
    if (to === "CLOSED") {
      const pendingRelances = campaign
        ? campaign.missions.filter(
            (m) =>
              m.sentAt &&
              !m.relanceCancelledAt &&
              (!m.relanceSentAt || !m.relance2SentAt)
          ).length
        : 0;
      const ok = window.confirm(
        pendingRelances > 0
          ? `Clôturer ce projet ?\n\nAttention : ${pendingRelances} marque(s) encore éligible(s) aux relances auto (J+3 / J+10) — elles seront définitivement stoppées.\nAucune nouvelle relance ne partira.`
          : `Clôturer ce projet ?\n\nLes relances automatiques (J+3 et J+10) seront bloquées pour toutes les marques de ce projet.`
      );
      if (!ok) return;
    }
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
      const cancelled =
        typeof data.cancelledRelances === "number" ? data.cancelledRelances : 0;
      setSuccess(
        to === "CLOSED"
          ? cancelled > 0
            ? `Projet clôturé · ${cancelled} relance(s) auto stoppée(s)`
            : "Projet clôturé · relances auto bloquées"
          : `Étape : ${STATUS_LABEL[to]}`
      );
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
      <div className="po-root po-workspace-loading" style={{ color: "var(--po-muted)" }}>
        <div className="inline-flex items-center gap-2 text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du projet…
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="po-root po-workspace-loading">
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
      <div className="po-workspace-header">
        <Link
          href="/projets-outreach"
          className="inline-flex items-center gap-1"
          style={{ fontSize: 12.5, color: "#6E6E77", marginBottom: 14 }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Tous les projets
        </Link>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {campaign.mode === "MULTI" && (campaign.talents?.length || 0) > 1 ? (
              <div className="flex -space-x-2">
                {(campaign.talents || []).slice(0, 4).map((t) => (
                  <div key={t.id} style={{ marginLeft: -4 }}>
                    <PoAvatar name={t.name} photo={t.photo} size={36} />
                  </div>
                ))}
              </div>
            ) : (
              <PoAvatar
                name={campaign.talent.name}
                photo={campaign.talent.photo}
                size={40}
              />
            )}
            <div className="min-w-0">
              <h1
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--po-ink)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {campaign.title}
                {campaign.mode === "MULTI" ? (
                  <span
                    className="po-badge"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: "#EEEAFB",
                      color: "#5B3F9E",
                    }}
                  >
                    Multi · {campaign.talents?.length || campaign.talentCount || 0}
                  </span>
                ) : null}
              </h1>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: "var(--po-tertiary)",
                  lineHeight: 1.45,
                }}
              >
                Gestion du projet ·{" "}
                <strong style={{ color: "var(--po-ink)", fontWeight: 600 }}>
                  {campaign.mode === "MULTI" && (campaign.talents?.length || 0) > 1
                    ? (campaign.talents || []).map((t) => t.name).join(", ")
                    : campaign.talent.name}
                </strong>
                {" · "}envoi {sender}
                {" · "}créé par {campaign.createdByName}
                {" · "}TM {tmLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {campaign.presentationPdfUrl ? (
              <button
                type="button"
                onClick={() => setPresentationPreviewOpen(true)}
                className="po-btn po-btn-primary"
                title="Aperçu de la présentation PDF du projet"
              >
                <Eye className="h-4 w-4" />
                Voir la présentation
              </button>
            ) : canManagePresentation(role) ? (
              <button
                type="button"
                onClick={() => {
                  setTab("brief");
                  requestAnimationFrame(() => {
                    document
                      .getElementById("presentation-projet")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
                className="po-btn po-btn-secondary"
                title="Ajouter une présentation PDF"
              >
                <FileText className="h-4 w-4" />
                Ajouter une présentation
              </button>
            ) : null}
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
          {TABS.filter(
            (t) => t.id !== "prestas" || Boolean(campaign.necessitePrestataires)
          ).map((t) => (
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
              {t.id === "prestas" ? (
                <span className="po-tab-badge">
                  {(campaign.prestataires || []).length}
                </span>
              ) : null}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab("a-completer")}
              className={`po-tab${tab === "a-completer" ? " po-tab-active" : ""}`}
              title="Admin · marques en attente de contacts"
              style={
                tab === "a-completer"
                  ? undefined
                  : { borderStyle: "dashed", opacity: 0.85 }
              }
            >
              À compléter
              {awaitingContactsCount > 0 ? (
                <span className="po-tab-badge">{awaitingContactsCount}</span>
              ) : null}
            </button>
          )}
        </div>
      </div>

      <div className="po-workspace-body">
        {(error || success) && (
          <div
            className={error ? "po-alert-error" : "po-alert-ok"}
            style={{ marginBottom: 16 }}
          >
            {error || success}
          </div>
        )}

        {awaitingContactsCount > 0 && (
          <div
            style={{
              marginBottom: 16,
              border: "1px solid #F5D9A8",
              background: "#FBF1DC",
              color: "#956A15",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
            }}
          >
            <strong>{awaitingContactsCount} marque(s) en attente de contacts</strong>
            {" — "}la rédaction est bloquée tant qu’un admin n’a pas cliqué
            « Contacts prêts » après avoir complété la fiche CRM.
          </div>
        )}

        {campaign.wave &&
          !bypassesWaveCastingGate(role) &&
          (campaign.wave.status === "COLLECTING" ||
            campaign.wave.status === "REVIEWING_CONDENSATIONS") && (
            <div
              style={{
                marginBottom: 16,
                border: "1px solid #D4C4F7",
                background: "#F4F0FC",
                color: "#5B3F9E",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
              }}
            >
              <strong>Casting bloquée</strong>
              {" — "}vague « {campaign.wave.title} » :{" "}
              {campaign.wave.status === "COLLECTING"
                ? "Strategy remplit encore les projets. Casting ne peut rien rédiger tant que la vague n’est pas « Terminée » puis validée."
                : "Strategy doit valider les condensations marques avant d’ouvrir la rédaction."}{" "}
              <Link href="/projets-outreach" className="underline font-medium">
                Voir la vague
              </Link>
            </div>
          )}

        {tab === "brief" && (
          <BriefTab
            campaign={campaign}
            canEdit={canEditBrief(role)}
            canEditPresentation={canManagePresentation(role)}
            role={role}
            userId={userId}
            onSaved={load}
            onPreviewPresentation={() => setPresentationPreviewOpen(true)}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "prestas" && campaign.necessitePrestataires && (
          <div>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 13,
                color: "var(--po-muted)",
              }}
            >
              {canManagePrestatairesOnCampaign(role, userId, {
                ownerTmId: campaign.ownerTmId,
                createdById: campaign.createdById,
              })
                ? "Tous les prestas du projet — statut, canal, relances. Ajoute depuis le CRM."
                : "Tes prestas assignés sur ce projet — statut, canal, relances."}
            </p>
            <MesPrestatairesPanel
              campaignId={campaign.id}
              showProjectLink={false}
              scopeAll={canManagePrestatairesOnCampaign(role, userId, {
                ownerTmId: campaign.ownerTmId,
                createdById: campaign.createdById,
              })}
            />
          </div>
        )}
        {tab === "marques" && (
          <MarquesTab
            campaign={campaign}
            canManage={canManageBrands(role)}
            isAdmin={isAdmin}
            onChanged={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "redaction" && (
          <RedactionTab
            campaign={campaign}
            canEdit={canDraft(role)}
            canEditPresentation={canManagePresentation(role)}
            role={role}
            isAdmin={isAdmin}
            onChanged={load}
            onPreviewPresentation={() => setPresentationPreviewOpen(true)}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "envois" && (
          <EnvoisTab
            campaign={campaign}
            canSendMails={canSend(role) || canDraft(role)}
            role={role}
            onChanged={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
        {tab === "suivi" && <SuiviTab campaign={campaign} />}
        {tab === "a-completer" && isAdmin && (
          <ACompleterTab
            campaign={campaign}
            onChanged={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
      </div>

      {presentationPreviewOpen && campaign.presentationPdfUrl && (
        <PresentationPreviewModal
          url={campaign.presentationPdfUrl}
          fileName={campaign.presentationFileName || "Présentation.pdf"}
          onClose={() => setPresentationPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function BriefTab({
  campaign,
  canEdit,
  canEditPresentation,
  role,
  userId,
  onSaved,
  onPreviewPresentation,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canEdit: boolean;
  canEditPresentation: boolean;
  role: string;
  userId: string;
  onSaved: () => Promise<void>;
  onPreviewPresentation: () => void;
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
      lieu: campaign.lieu || "",
      necessitePrestataires: Boolean(campaign.necessitePrestataires),
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
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          objective: form.objective,
          deliverables: form.deliverables,
          budgetRange: form.budgetRange,
          timeline: form.timeline,
          angles: form.angles,
          dos: form.dos,
          donts: form.donts,
          lieu: form.lieu,
          necessitePrestataires: form.necessitePrestataires,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sauvegarde impossible.");
      setSuccess(
        form.necessitePrestataires && !campaign.necessitePrestataires
          ? "Prestataires activés sur ce projet."
          : "Brief enregistré."
      );
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PresentationCard
          campaign={campaign}
          canEdit={canEditPresentation}
          onSaved={onSaved}
          onPreview={onPreviewPresentation}
          setError={setError}
          setSuccess={setSuccess}
        />

        <form
          onSubmit={onSubmit}
          className="po-card"
          style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 13.5,
              fontWeight: 650,
              color: "var(--po-ink)",
              cursor: canEdit ? "pointer" : "default",
              border: form.necessitePrestataires
                ? "1px solid #D4C4F7"
                : "1px solid #F4F4F5",
              background: form.necessitePrestataires ? "#F4F0FC" : "#FAFAFA",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={form.necessitePrestataires}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  necessitePrestataires: e.target.checked,
                }))
              }
              style={{ marginTop: 2 }}
            />
            <span>
              Ce projet nécessite des prestataires
              <span
                style={{
                  display: "block",
                  fontWeight: 500,
                  fontSize: 12.5,
                  color: "var(--po-muted)",
                  marginTop: 2,
                }}
              >
                Coche pour assigner qui s’occupe de chaque presta (hôtel, traiteur…).
              </span>
            </span>
          </label>

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
            <Field label="Lieu">
              <input
                disabled={!canEdit}
                value={form.lieu}
                onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))}
                className="po-input"
                placeholder="Paris, villa…"
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

        <PrestatairesBlock
          campaign={campaign}
          role={role}
          userId={userId}
          onChanged={onSaved}
          setError={setError}
          setSuccess={setSuccess}
        />
      </div>

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

type AssignableUser = { id: string; firstName: string; lastName: string; role: string };

function PrestatairesBlock({
  campaign,
  role,
  userId,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  role: string;
  userId: string;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const prestasOk = needsPrestataires(campaign);
  const canManage = canManagePrestatairesOnCampaign(role, userId, {
    ownerTmId: campaign.ownerTmId,
    createdById: campaign.createdById,
  });
  const rows = campaign.prestataires || [];

  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [saving, setSaving] = useState(false);
  const projectTalents = useMemo(() => {
    if (campaign.talents && campaign.talents.length > 0) return campaign.talents;
    return [
      {
        id: campaign.talent.id,
        name: campaign.talent.name,
        photo: campaign.talent.photo,
      },
    ];
  }, [campaign.talent, campaign.talents]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/users/mentionable", { credentials: "include" });
        const data = await res.json().catch(() => []);
        if (!cancelled && Array.isArray(data)) setUsers(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function patchRow(id: string, patch: Record<string, string>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/prestataires/${id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: string) {
    if (!canManage) return;
    if (!window.confirm("Retirer ce prestataire ?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/prestataires/${id}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      setSuccess("Prestataire retiré.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="po-card" style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
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
            Prestataires
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--po-muted)" }}>
            Qui s’occupe de quoi — talent du projet ou équipe interne.
          </p>
        </div>
        <span style={{ fontSize: 12, color: "var(--po-muted)" }}>
          {rows.length} presta{rows.length > 1 ? "s" : ""}
        </span>
      </div>

      {!prestasOk ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--po-muted)" }}>
          Coche « Ce projet nécessite des prestataires » ci-dessus pour assigner
          qui s’occupe de quoi.
        </p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--po-muted)", fontSize: 11.5 }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Nom</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Catégorie</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Responsable</th>
                  {canManage ? <th style={{ padding: "6px 8px", fontWeight: 600 }} /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 4 : 3}
                      style={{ padding: "14px 8px", color: "var(--po-muted)" }}
                    >
                      Aucun prestataire pour l’instant.
                    </td>
                  </tr>
                ) : (
                  rows.map((p) => {
                    const canEditLine = canEditPrestataireLine(
                      role,
                      userId,
                      {
                        ownerTmId: campaign.ownerTmId,
                        createdById: campaign.createdById,
                      },
                      p.responsableId
                    );
                    return (
                      <tr key={p.id} style={{ borderTop: "1px solid var(--po-sep-soft)" }}>
                        <td style={{ padding: "8px" }}>
                          {canEditLine ? (
                            <input
                              className="po-input"
                              defaultValue={p.nom}
                              disabled={saving}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== p.nom) void patchRow(p.id, { nom: v });
                              }}
                            />
                          ) : p.prestataireCrmId ? (
                            <Link
                              href={`/prestataires/${p.prestataireCrmId}`}
                              className="underline-offset-2 hover:underline"
                              style={{ color: "var(--po-ink)", fontWeight: 600 }}
                            >
                              {p.nom}
                            </Link>
                          ) : (
                            p.nom
                          )}
                        </td>
                        <td style={{ padding: "8px" }}>
                          {canEditLine ? (
                            <select
                              className="po-input"
                              value={p.categorie}
                              disabled={saving}
                              onChange={(e) =>
                                void patchRow(p.id, { categorie: e.target.value })
                              }
                            >
                              {PRESTATAIRE_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {PRESTATAIRE_CATEGORIE_LABEL[c]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            PRESTATAIRE_CATEGORIE_LABEL[
                              p.categorie as PrestataireCategorie
                            ] || p.categorie
                          )}
                        </td>
                        <td style={{ padding: "8px" }}>
                          {canManage ? (
                            <select
                              className="po-input"
                              value={formatResponsableValue({
                                responsableId: p.responsableId,
                                responsableTalentId: p.responsableTalentId,
                              })}
                              disabled={saving}
                              onChange={(e) =>
                                void patchRow(p.id, { responsable: e.target.value })
                              }
                            >
                              <optgroup label="Talent du projet">
                                {projectTalents.map((t) => (
                                  <option key={`talent:${t.id}`} value={`talent:${t.id}`}>
                                    {t.name} (talent)
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Équipe interne">
                                {users.map((u) => (
                                  <option key={`user:${u.id}`} value={`user:${u.id}`}>
                                    {u.firstName} {u.lastName} ({u.role})
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          ) : (
                            <>
                              {p.responsableName}
                              {p.responsableKind === "TALENT" ? " · talent" : ""}
                            </>
                          )}
                        </td>
                        {canManage ? (
                          <td style={{ padding: "8px" }}>
                            <button
                              type="button"
                              className="po-btn po-btn-secondary"
                              disabled={saving}
                              onClick={() => void removeRow(p.id)}
                              style={{ fontSize: 12, padding: "4px 8px" }}
                            >
                              Retirer
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {canManage ? (
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #F4F4F5",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <Link
                href={`/prestataires?projet=${campaign.id}`}
                className="po-btn po-btn-primary"
                style={{ textDecoration: "none" }}
              >
                CRM → type → ville → ajouter
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ACompleterTab({
  campaign,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const awaiting = useMemo(
    () => campaign.missions.filter((m) => m.awaitingContactsCompletion),
    [campaign.missions]
  );

  async function resolveCompletion(m: Mission) {
    setBusyId(m.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/resolve-marque-completion`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missionId: m.id }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Déblocage impossible.");
      setSuccess(data.message || `${m.marqueNom || m.targetBrand} débloquée.`);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  const cols = "1.4fr 1fr .7fr auto";

  if (awaiting.length === 0) {
    return (
      <div className="po-empty">
        Aucune marque en attente de contacts sur ce projet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 13, color: "var(--po-secondary)", margin: 0 }}>
        Complète la fiche CRM, puis clique « Contacts prêts » pour débloquer la
        rédaction.
      </p>
      <div className="po-card po-table-scroll">
        <div className="po-table-head" style={{ gridTemplateColumns: cols }}>
          <div>Marque</div>
          <div>Contacts</div>
          <div className="po-col-hide-mobile">Priorité</div>
          <div />
        </div>
        {awaiting.map((m) => {
          const name = m.marqueNom || m.targetBrand;
          const contactCount = effectiveMissionContacts(m).length;
          return (
            <div
              key={m.id}
              className="po-table-row"
              style={{
                gridTemplateColumns: cols,
                background: "var(--po-prio-med-bg)",
                alignItems: "center",
              }}
            >
              <div className="min-w-0">
                <div style={{ fontWeight: 600, color: "var(--po-ink)" }}>{name}</div>
                {m.strategyReason ? (
                  <div
                    className="truncate"
                    style={{ fontSize: 12, color: "var(--po-tertiary)" }}
                    title={m.strategyReason}
                  >
                    {m.strategyReason}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                {contactCount} emailé{contactCount > 1 ? "s" : ""}
              </div>
              <div className="po-col-hide-mobile">
                <PriorityBadge priority={m.priority} />
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {m.marqueId ? (
                  <Link
                    href={`/marques/${m.marqueId}`}
                    className="po-btn po-btn-primary"
                    style={{
                      padding: "7px 10px",
                      fontSize: 12,
                      textDecoration: "none",
                    }}
                    title="Ouvrir la fiche marque"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                    À compléter
                  </Link>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--po-muted)" }}>
                    Pas de fiche
                  </span>
                )}
                <button
                  type="button"
                  className="po-btn"
                  style={{ padding: "7px 10px", fontSize: 12 }}
                  disabled={busyId === m.id}
                  onClick={() => void resolveCompletion(m)}
                >
                  {busyId === m.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                      Contacts prêts
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarquesTab({
  campaign,
  canManage,
  isAdmin,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canManage: boolean;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const [crm, setCrm] = useState<MarqueHit[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [searchHits, setSearchHits] = useState<MarqueHit[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [manualBrand, setManualBrand] = useState("");
  const [reason, setReason] = useState("");
  const [angle, setAngle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  /** Marque bloquée à l’ajout → proposer « Mise en attente ». */
  const [holdOffer, setHoldOffer] = useState<{
    hit: MarqueHit;
    nextAllowedAt: string | null;
    message: string;
  } | null>(null);
  const campaignTalents = campaign.talents || [];
  const isMulti = campaign.mode === "MULTI" && campaignTalents.length >= 2;
  const [brandTalentIds, setBrandTalentIds] = useState<string[]>(() =>
    campaignTalents.map((t) => t.id)
  );

  useEffect(() => {
    setBrandTalentIds(campaignTalents.map((t) => t.id));
  }, [campaign.id, campaign.mode, campaignTalents.map((t) => t.id).join(",")]);

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

  // Catalogue partiel (cap API 2000) pour parcourir sans saisie.
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

  // Dès 2 caractères : vraie recherche serveur (sinon Transavia etc. hors cap 2000).
  useEffect(() => {
    const q = filter.trim();
    if (q.length < 2) {
      setSearchHits(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/marques/search?q=${encodeURIComponent(q)}`,
          { credentials: "include" }
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setSearchHits(Array.isArray(data.marques) ? data.marques : []);
        }
      } catch {
        if (!cancelled) setSearchHits([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filter]);

  const filteredCrm = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q.length >= 2) return searchHits ?? [];
    if (!q) return crm;
    return crm.filter(
      (m) =>
        m.nom.toLowerCase().includes(q) ||
        (m.ville || "").toLowerCase().includes(q)
    );
  }, [crm, filter, searchHits]);

  const listLoading = filter.trim().length >= 2 ? searchLoading : crmLoading;

  async function postBrand(
    item: {
      targetBrand: string;
      marqueId?: string | null;
    },
    opts?: { hold?: boolean }
  ) {
    if (isMulti && brandTalentIds.length < 1) {
      throw new Error("Sélectionne au moins 1 talent pour cette marque.");
    }
    const res = await fetch(`/api/projets-outreach/${campaign.id}/brands`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hold: opts?.hold === true,
        items: [
          {
            targetBrand: item.targetBrand,
            marqueId: item.marqueId ?? null,
            strategyReason: reason.trim(),
            recommendedAngle: angle.trim() || null,
            priority,
            clientContacts: null,
            ...(isMulti ? { selectedTalentIds: brandTalentIds } : {}),
          },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Ajout impossible.") as Error & {
        code?: string;
        canHold?: boolean;
        nextAllowedAt?: string | null;
      };
      err.code = data.code;
      err.canHold = data.canHold === true;
      err.nextAllowedAt = data.nextAllowedAt ?? null;
      throw err;
    }
    if (typeof data.waveNotice === "string" && data.waveNotice.trim()) {
      setSuccess(data.waveNotice);
    }
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
    setHoldOffer(null);
    try {
      const data = await postBrand({ targetBrand: hit.nom, marqueId: hit.id });
      if (!(typeof data?.waveNotice === "string" && data.waveNotice.trim())) {
        setSuccess(`${hit.nom} ajoutée.`);
      }
      await onChanged();
    } catch (err) {
      const e = err as Error & {
        code?: string;
        canHold?: boolean;
        nextAllowedAt?: string | null;
      };
      if (e.code === "BRAND_COOLDOWN" && e.canHold) {
        setHoldOffer({
          hit,
          nextAllowedAt: e.nextAllowedAt ?? null,
          message: e.message,
        });
        setError(
          `${hit.nom} déjà contactée récemment — Ajouter est bloqué. Utilise « Mise en attente » (déblocage auto J+30).`
        );
      } else {
        setError(e.message || "Erreur");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function holdFromCrm(hit: MarqueHit) {
    if (!canManage || savingId || isMulti) return;
    if (alreadyIds.has(hit.id) || alreadyNames.has(hit.nom.trim().toLowerCase())) {
      setError(`${hit.nom} est déjà dans le projet.`);
      return;
    }
    setSavingId(hit.id);
    setError(null);
    try {
      const data = await postBrand(
        { targetBrand: hit.nom, marqueId: hit.id },
        { hold: true }
      );
      setHoldOffer(null);
      if (!(typeof data?.waveNotice === "string" && data.waveNotice.trim())) {
        setSuccess(`${hit.nom} mise en attente — déblocage auto à J+30.`);
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  async function completeFromCrm(hit: MarqueHit) {
    if (!canManage || savingId || requestingId) return;

    const note = window.prompt(
      `Que faut-il compléter sur « ${hit.nom} » ? (${hit.contactCount} contact${hit.contactCount > 1 ? "s" : ""} CRM)`,
      hit.contactCount === 0
        ? "Aucun contact — merci d’ajouter les bons interlocuteurs sur la fiche existante."
        : "Peu de contacts — merci d’enrichir la fiche existante (pas de doublon)."
    );
    if (note === null) return;

    setSavingId(hit.id);
    setRequestingId(hit.id);
    setError(null);
    try {
      let mission =
        campaign.missions.find((m) => m.marqueId === hit.id) ||
        campaign.missions.find(
          (m) =>
            (m.marqueNom || m.targetBrand || "").trim().toLowerCase() ===
            hit.nom.trim().toLowerCase()
        ) ||
        null;

      if (!mission) {
        const data = await postBrand({ targetBrand: hit.nom, marqueId: hit.id });
        const created = Array.isArray(data.missions) ? data.missions[0] : null;
        const missionId = String(created?.id || "").trim();
        if (!missionId) {
          throw new Error("Marque ajoutée, mais mission introuvable pour la demande.");
        }
        mission = {
          id: missionId,
          marqueId: hit.id,
          marqueNom: hit.nom,
          targetBrand: hit.nom,
        } as Mission;
      }

      if (!mission.marqueId) {
        throw new Error("Cette marque n’est pas liée à une fiche CRM.");
      }

      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/request-marque-completion`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marqueId: mission.marqueId,
            missionId: mission.id,
            note: note.trim() || undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Demande impossible."
        );
      }
      setSuccess(
        typeof data.message === "string"
          ? data.message
          : `${hit.nom} mise en attente — admins notifiés.`
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingId(null);
      setRequestingId(null);
    }
  }

  async function addManual(e: FormEvent, opts?: { hold?: boolean }) {
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
      const data = await postBrand(
        { targetBrand, marqueId: null },
        { hold: opts?.hold === true }
      );
      if (!(typeof data?.waveNotice === "string" && data.waveNotice.trim())) {
        setSuccess(
          opts?.hold
            ? `${targetBrand} mise en attente — déblocage auto à J+30.`
            : `${targetBrand} ajoutée.`
        );
      }
      setManualBrand("");
      setHoldOffer(null);
      await onChanged();
    } catch (err) {
      const e2 = err as Error & {
        code?: string;
        canHold?: boolean;
        nextAllowedAt?: string | null;
      };
      if (e2.code === "BRAND_COOLDOWN" && e2.canHold && !opts?.hold) {
        setError(
          `${targetBrand} déjà contactée — Ajouter libre bloqué. Clique « Mise en attente » à côté.`
        );
      } else {
        setError(e2.message || "Erreur");
      }
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

  const tableCols = "1.1fr 1.6fr .7fr .55fr 1.15fr 36px";

  async function requestCompletion(m: Mission) {
    if (!m.marqueId) {
      setError("Cette marque n’est pas liée à une fiche CRM — lie-la d’abord depuis le CRM.");
      return;
    }
    const contactCount = effectiveMissionContacts(m).length;
    const note = window.prompt(
      `Que faut-il compléter sur « ${m.marqueNom || m.targetBrand} » ? (${contactCount} contact emailé${contactCount > 1 ? "s" : ""})`,
      contactCount === 0
        ? "Aucun contact — merci d’ajouter les bons interlocuteurs sur la fiche existante."
        : "Un seul contact — merci d’ajouter d’autres interlocuteurs pertinents sur la fiche existante."
    );
    if (note === null) return;

    setRequestingId(m.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/request-marque-completion`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marqueId: m.marqueId,
            missionId: m.id,
            note: note.trim() || undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Demande impossible."
        );
      }
      setSuccess(
        typeof data.message === "string"
          ? data.message
          : "Demande envoyée pour compléter la fiche."
      );
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setRequestingId(null);
    }
  }

  async function resolveCompletion(m: Mission) {
    setRequestingId(m.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/resolve-marque-completion`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missionId: m.id }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Déblocage impossible."
        );
      }
      setSuccess(
        typeof data.message === "string" ? data.message : "Rédaction débloquée."
      );
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setRequestingId(null);
    }
  }

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

          {isMulti ? (
            <div style={{ marginBottom: 12 }}>
              <div
                className="po-field-label"
                style={{ marginBottom: 6 }}
              >
                Talents pour les prochaines marques ({brandTalentIds.length}/
                {campaignTalents.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {campaignTalents.map((t) => {
                  const checked = brandTalentIds.includes(t.id);
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
                          setBrandTalentIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== t.id)
                              : [...prev, t.id]
                          );
                        }}
                        style={{ marginRight: 6 }}
                      />
                      {t.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

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
            {listLoading ? (
              <div
                className="flex items-center gap-2"
                style={{ padding: 16, fontSize: 13, color: "var(--po-muted)" }}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {filter.trim().length >= 2 ? "Recherche…" : "Chargement du CRM…"}
              </div>
            ) : filteredCrm.length === 0 ? (
              <div className="po-empty" style={{ border: "none", padding: 24 }}>
                {filter.trim().length >= 2
                  ? `Aucune marque pour « ${filter.trim()} ».`
                  : crm.length === 0
                  ? "Aucune marque dans le CRM."
                  : "Aucun résultat pour ce filtre."}
              </div>
            ) : (
              filteredCrm.map((h) => {
                const already =
                  alreadyIds.has(h.id) || alreadyNames.has(h.nom.trim().toLowerCase());
                const existingMission =
                  campaign.missions.find((m) => m.marqueId === h.id) ||
                  campaign.missions.find(
                    (m) =>
                      (m.marqueNom || m.targetBrand || "").trim().toLowerCase() ===
                      h.nom.trim().toLowerCase()
                  );
                const awaiting = Boolean(existingMission?.awaitingContactsCompletion);
                const onCooldown = existingMission
                  ? brandCooldownActive(existingMission)
                  : false;
                const rowBusy = savingId === h.id || requestingId === h.id;
                const offerHold = holdOffer?.hit.id === h.id;
                const showCompleter = !awaiting;
                return (
                  <div
                    key={h.id}
                    className="flex items-center gap-3"
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--po-sep-soft)",
                      background:
                        offerHold || onCooldown
                          ? "var(--po-prio-med-bg)"
                          : already
                            ? "transparent"
                            : "var(--po-white)",
                    }}
                  >
                    <PoAvatar name={h.nom} size={28} />
                    <div className="min-w-0 flex-1">
                      <div style={{ fontWeight: 600, color: "var(--po-ink)" }}>{h.nom}</div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color:
                            h.contactCount <= 1 ? "var(--po-prio-med-fg)" : "var(--po-muted)",
                          fontWeight: h.contactCount <= 1 ? 600 : 400,
                        }}
                      >
                        {h.contactCount} contact{h.contactCount === 1 ? "" : "s"}
                        {h.ville ? ` · ${h.ville}` : ""}
                        {awaiting ? " · en attente contacts" : ""}
                        {onCooldown
                          ? ` · attente déblocage ${brandCooldownLabel(existingMission!)}`
                          : ""}
                        {offerHold ? " · déjà contactée récemment" : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {already ? (
                        <span
                          className="po-badge po-badge-stage"
                          style={{ fontSize: 11 }}
                        >
                          {onCooldown ? "En attente" : "Déjà ajoutée"}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy || rowBusy || offerHold}
                            onClick={() => void addFromCrm(h)}
                            className="po-btn po-btn-primary"
                            style={{
                              padding: "6px 12px",
                              fontSize: 12.5,
                              opacity: offerHold ? 0.45 : 1,
                            }}
                            title={
                              offerHold
                                ? "Bloqué — marque déjà contactée. Utilise Mise en attente."
                                : "Ajouter au projet"
                            }
                          >
                            {rowBusy && savingId === h.id && !requestingId && !offerHold ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {offerHold ? "Bloqué" : "Ajouter"}
                          </button>
                          {!isMulti ? (
                            <button
                              type="button"
                              disabled={busy || rowBusy}
                              onClick={() => void holdFromCrm(h)}
                              className="po-btn"
                              style={{
                                padding: "6px 12px",
                                fontSize: 12.5,
                                fontWeight: offerHold ? 700 : 500,
                                borderColor: offerHold ? "#C9A227" : undefined,
                                color: offerHold ? "#956A15" : undefined,
                              }}
                              title="Ajoute la marque en attente — déblocage automatique à J+30"
                            >
                              {rowBusy &&
                              savingId === h.id &&
                              holdOffer?.hit.id === h.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              Mise en attente
                            </button>
                          ) : null}
                        </>
                      )}
                      {awaiting && existingMission && isAdmin ? (
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => void resolveCompletion(existingMission)}
                          className="po-btn po-btn-primary"
                          style={{ padding: "6px 12px", fontSize: 12.5 }}
                        >
                          {rowBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Contacts prêts
                        </button>
                      ) : showCompleter ? (
                        <button
                          type="button"
                          disabled={busy || rowBusy}
                          onClick={() => void completeFromCrm(h)}
                          className="po-btn po-btn-secondary"
                          style={{ padding: "6px 12px", fontSize: 12.5 }}
                          title="Ajoute au projet si besoin, notifie les admins et bloque la rédaction"
                        >
                          {rowBusy && requestingId === h.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Compléter
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => void addManual(e)}
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
            {!isMulti ? (
              <button
                type="button"
                disabled={busy || !manualBrand.trim() || savingId === "__manual__"}
                onClick={(e) => void addManual(e, { hold: true })}
                className="po-btn"
                title="Ajoute en attente — déblocage automatique à J+30"
              >
                Mise en attente
              </button>
            ) : null}
          </form>
        </div>
      )}

      <div className="po-card po-table-scroll">
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
          <span>Contacts</span>
          <span />
        </div>
        {campaign.missions.length === 0 ? (
          <div className="po-empty" style={{ border: "none", borderRadius: 0 }}>
            Aucune marque pour l&apos;instant — ajoute-les depuis le CRM ci-dessus.
          </div>
        ) : (
          campaign.missions.map((m) => {
            const name = m.marqueNom || m.targetBrand;
            const contactCount = effectiveMissionContacts(m).length;
            const awaiting = Boolean(m.awaitingContactsCompletion);
            const onCooldown = brandCooldownActive(m);
            const needsCompletion = Boolean(m.marqueId) && !awaiting;
            return (
              <div
                key={m.id}
                className="po-table-row"
                style={{
                  gridTemplateColumns: tableCols,
                  background:
                    awaiting || onCooldown ? "var(--po-prio-med-bg)" : undefined,
                }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <PoAvatar name={name} size={26} />
                    <div className="min-w-0">
                    <div style={{ fontWeight: 600, color: "var(--po-ink)" }}>{name}</div>
                    {onCooldown ? (
                      <div
                        style={{ fontSize: 11, color: "#956A15", fontWeight: 700 }}
                        title={m.brandCooldownReason || undefined}
                      >
                        En attente · déblocage {brandCooldownLabel(m)}
                      </div>
                    ) : null}
                    {isMulti &&
                    Array.isArray(m.selectedTalentIds) &&
                    m.selectedTalentIds.length > 0 ? (
                      <div style={{ fontSize: 11, color: "#5B3F9E", fontWeight: 600 }}>
                        {(campaign.talents || [])
                          .filter((t) => m.selectedTalentIds!.includes(t.id))
                          .map((t) => t.name)
                          .join(", ") || `${m.selectedTalentIds.length} talent(s)`}
                      </div>
                    ) : null}
                    {m.condensationStatus === "CONDENSED" ||
                    m.condensationRole === "PRIMARY" ||
                    m.condensationRole === "MEMBER" ? (
                      <div style={{ fontSize: 11, color: "#5B3F9E", fontWeight: 600 }}>
                        {m.condensationPeerNames && m.condensationPeerNames.length > 0
                          ? `Condensée avec ${m.condensationPeerNames.join(", ")} · 1 mail`
                          : "Condensée · 1 mail pour le groupe"}
                      </div>
                    ) : null}
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
                  {awaiting ? (
                    <StageDotBadge label="En attente contacts" />
                  ) : (
                    <StageDotBadge label={STAGE_LABEL[m.stage] || m.stage} />
                  )}
                </div>
                <div>
                  <PriorityBadge priority={m.priority} />
                </div>
                <div style={{ fontSize: 12 }}>
                  <div
                    style={{
                      color: awaiting ? "var(--po-prio-med-fg)" : "var(--po-tertiary)",
                      fontWeight: awaiting ? 600 : 400,
                    }}
                  >
                    {contactCount} emailé{contactCount > 1 ? "s" : ""}
                  </div>
                  {awaiting ? (
                    isAdmin ? (
                      <div style={{ marginTop: 6 }} className="flex flex-wrap gap-1.5">
                        {m.marqueId ? (
                          <Link
                            href={`/marques/${m.marqueId}`}
                            className="po-btn po-btn-primary"
                            style={{
                              padding: "4px 8px",
                              fontSize: 11,
                              textDecoration: "none",
                            }}
                            title="Ouvrir la fiche marque"
                          >
                            À compléter
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={requestingId === m.id}
                          onClick={() => void resolveCompletion(m)}
                          className="po-btn"
                          style={{
                            padding: "4px 8px",
                            fontSize: 11,
                          }}
                          title="Après avoir complété la fiche CRM, débloque la rédaction"
                        >
                          {requestingId === m.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Contacts prêts"
                          )}
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          color: "var(--po-prio-med-fg)",
                          fontWeight: 600,
                        }}
                      >
                        En attente admin
                      </div>
                    )
                  ) : needsCompletion ? (
                    <button
                      type="button"
                      disabled={requestingId === m.id}
                      onClick={() => void requestCompletion(m)}
                      className="po-btn po-btn-secondary"
                      style={{
                        marginTop: 6,
                        padding: "4px 8px",
                        fontSize: 11,
                      }}
                      title="Notifie tous les admins et bloque la rédaction"
                    >
                      {requestingId === m.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Compléter"
                      )}
                    </button>
                  ) : null}
                  {!m.marqueId && (
                    <div style={{ marginTop: 4, fontSize: 11, color: "var(--po-muted)" }}>
                      Pas de fiche CRM
                    </div>
                  )}
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
  canEditPresentation,
  role,
  isAdmin,
  onChanged,
  onPreviewPresentation,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canEdit: boolean;
  canEditPresentation: boolean;
  role: string;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  onPreviewPresentation: () => void;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const draftable = useMemo(
    () =>
      campaign.missions.filter((m) => {
        // Après envoi condensé (miroir), la carte disparaît des deux côtés.
        if (m.sentAt || m.stage === "SENT") return false;
        return (
          m.stage === "TO_DRAFT" ||
          m.stage === "DRAFTED_FOR_VALIDATION" ||
          m.stage === "STRATEGY_DEFINED" ||
          m.stage === "TO_SEND"
        );
      }),
    [campaign.missions]
  );

  const waveBlocksCasting =
    !bypassesWaveCastingGate(role) &&
    (campaign.wave?.status === "COLLECTING" ||
      campaign.wave?.status === "REVIEWING_CONDENSATIONS");

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
      condensationBriefs?: Array<{
        missionId: string;
        talentId?: string | null;
        projectTitle?: string | null;
        projectDescription?: string | null;
        creatorName?: string | null;
        targetBrand?: string | null;
        strategyReason?: string | null;
        recommendedAngle?: string | null;
        objective?: string | null;
        deliverables?: string | null;
        angles?: string | null;
        timeline?: string | null;
        budgetRange?: string | null;
        dos?: string | null;
        donts?: string | null;
      }> | null;
      /** Projet commun MULTI (Calendrier…) vs condensation cross-projets. */
      sharedProject?: boolean;
    };
  };

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContact, setComposerContact] = useState<ComposerContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [brandResearchCache, setBrandResearchCache] = useState<
    Record<string, CachedBrandResearch>
  >(() => loadBrandResearchCache(campaign.id));
  const [talentResearchCache, setTalentResearchCache] = useState<
    Record<string, CachedTalentResearchItem[]>
  >(() => loadTalentResearchCache(campaign.id));
  const [leynaExchangeCache, setLeynaExchangeCache] = useState<
    Record<string, CachedLeynaExchange>
  >(() => loadLeynaExchangeCache(campaign.id));
  const [batchResearch, setBatchResearch] = useState<{
    running: boolean;
    phase: "marques" | "talents";
    done: number;
    total: number;
    phaseDone: number;
    phaseTotal: number;
    current: string;
    failed: number;
    /** Noms des marques en échec (pour l’UI). */
    failedNames?: string[];
    /** true = vague de relance (échecs uniquement). */
    isRetry?: boolean;
  } | null>(null);
  /** Boîte mail peut tourner en parallèle des talents (état séparé). */
  const [batchLeyna, setBatchLeyna] = useState<{
    running: boolean;
    done: number;
    total: number;
    current: string;
    failed: number;
    failedNames?: string[];
    isRetry?: boolean;
  } | null>(null);
  /** Pipeline marque → talents → Leyna → rédaction (casting n’a plus qu’à corriger). */
  const [batchPipeline, setBatchPipeline] = useState<{
    running: boolean;
    step: 1 | 2 | 3 | 4;
    label: string;
  } | null>(null);
  const [batchDraft, setBatchDraft] = useState<{
    running: boolean;
    done: number;
    total: number;
    current: string;
    failed: number;
    failedNames?: string[];
    isRetry?: boolean;
  } | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const batchLeynaAbortRef = useRef<AbortController | null>(null);
  const batchDraftAbortRef = useRef<AbortController | null>(null);
  const batchPipelineActiveRef = useRef(false);

  useEffect(() => {
    setBrandResearchCache(loadBrandResearchCache(campaign.id));
    setTalentResearchCache(loadTalentResearchCache(campaign.id));
    setLeynaExchangeCache(loadLeynaExchangeCache(campaign.id));
  }, [campaign.id]);

  const cacheBrandResearch = useCallback(
    (brandName: string, research: CachedBrandResearch) => {
      const key = brandResearchKey(brandName);
      if (!key) return;
      setBrandResearchCache((prev) => {
        const next = { ...prev, [key]: research };
        saveBrandResearchCache(campaign.id, next);
        return next;
      });
      // Nouvelle analyse marque → invalide le cache talents de cette marque.
      setTalentResearchCache((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        saveTalentResearchCache(campaign.id, next);
        return next;
      });
    },
    [campaign.id]
  );

  const cacheTalentResearch = useCallback(
    (brandName: string, research: CachedTalentResearchItem[]) => {
      const key = brandResearchKey(brandName);
      if (!key || research.length === 0) return;
      setTalentResearchCache((prev) => {
        const next = { ...prev, [key]: research };
        saveTalentResearchCache(campaign.id, next);
        return next;
      });
    },
    [campaign.id]
  );

  const cacheLeynaExchange = useCallback(
    (brandName: string, research: CachedLeynaExchange) => {
      const key = brandResearchKey(brandName);
      if (!key) return;
      setLeynaExchangeCache((prev) => {
        const next = { ...prev, [key]: research };
        saveLeynaExchangeCache(campaign.id, next);
        return next;
      });
    },
    [campaign.id]
  );

  const composerLockedTalentIds = useMemo(() => {
    const briefs = composerContact?.missionBrief?.condensationBriefs;
    if (!briefs || briefs.length < 2) return null;
    const fromBriefs = briefs
      .map((b) => String(b.talentId || "").trim())
      .filter(Boolean);
    if (fromBriefs.length >= 2) return Array.from(new Set(fromBriefs));
    const currentId = campaign.talent.id;
    return Array.from(
      new Set([currentId, ...fromBriefs.filter((id) => id !== currentId)])
    );
  }, [composerContact, campaign.talent.id]);

  const composerInitialBrandResearch = useMemo(() => {
    // Même priorité que le batch : marqueNom (company) puis targetBrand.
    return lookupBrandCache(
      brandResearchCache,
      composerContact?.company,
      composerContact?.missionBrief?.targetBrand
    );
  }, [composerContact, brandResearchCache]);

  const composerInitialTalentResearch = useMemo(() => {
    return lookupBrandCache(
      talentResearchCache,
      composerContact?.company,
      composerContact?.missionBrief?.targetBrand
    );
  }, [composerContact, talentResearchCache]);

  const composerInitialLeynaExchange = useMemo(() => {
    return lookupBrandCache(
      leynaExchangeCache,
      composerContact?.company,
      composerContact?.missionBrief?.targetBrand
    );
  }, [composerContact, leynaExchangeCache]);

  /**
   * Marques à analyser en batch : une entrée / marque (cache projet).
   * Inclus PRIMARY et MEMBER (sinon Cultura condensée MEMBER n’était jamais analysée ici).
   * Si les deux existent pour la même marque, on préfère PRIMARY (meilleurs briefs).
   */
  const brandsToBatchResearch = useMemo(() => {
    const byKey = new Map<string, Mission>();
    for (const m of draftable) {
      if (brandCooldownActive(m)) continue;
      const name = (m.marqueNom || m.targetBrand || "").trim();
      if (!name) continue;
      const key = brandResearchKey(name);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, m);
        continue;
      }
      if (
        existing.condensationRole === "MEMBER" &&
        m.condensationRole === "PRIMARY"
      ) {
        byKey.set(key, m);
      }
    }
    return Array.from(byKey.values());
  }, [draftable]);

  const brandCacheCount = useMemo(
    () =>
      brandsToBatchResearch.filter((m) =>
        hasBrandCacheEntry(brandResearchCache, m.marqueNom, m.targetBrand)
      ).length,
    [brandsToBatchResearch, brandResearchCache]
  );
  const talentCacheCount = useMemo(
    () =>
      brandsToBatchResearch.filter((m) => {
        const hit = lookupBrandCache(
          talentResearchCache,
          m.marqueNom,
          m.targetBrand
        );
        return Array.isArray(hit) && hit.length > 0;
      }).length,
    [brandsToBatchResearch, talentResearchCache]
  );
  const leynaCacheCount = useMemo(
    () =>
      brandsToBatchResearch.filter((m) =>
        hasBrandCacheEntry(leynaExchangeCache, m.marqueNom, m.targetBrand)
      ).length,
    [brandsToBatchResearch, leynaExchangeCache]
  );

  async function buildProjectPayloadForMission(
    m: Mission,
    brandName: string,
    signal: AbortSignal
  ): Promise<{
    projectPayload: Record<string, unknown>;
    talentIds: string[];
  }> {
    let projectPayload: Record<string, unknown> = {
      projectBrief: {
        talentId: campaign.talent.id,
        projectTitle: campaign.title,
        projectDescription: campaign.description,
        creatorName: campaign.talent.name,
        targetBrand: brandName,
        strategyReason: m.strategyReason,
        recommendedAngle: m.recommendedAngle,
        objective: m.objective || campaign.objective,
        deliverables: campaign.deliverables,
        angles: campaign.angles,
        timeline: campaign.timeline,
        budgetRange: campaign.budgetRange,
        dos: m.dos || campaign.dos,
        donts: m.donts || campaign.donts,
      },
    };
    let talentIds: string[] = [campaign.talent.id];

    if (campaign.mode === "MULTI" && (campaign.talents?.length || 0) >= 2) {
      const all = campaign.talents || [];
      const selected =
        Array.isArray(m.selectedTalentIds) && m.selectedTalentIds.length > 0
          ? all.filter((t) => m.selectedTalentIds!.includes(t.id))
          : all;
      const forMail = selected.length >= 1 ? selected : all;
      talentIds = forMail.map((t) => t.id).filter(Boolean);
      if (forMail.length >= 2) {
        projectPayload = {
          sharedProject: true,
          projectBriefs: forMail.map((t) => ({
            talentId: t.id,
            projectTitle: campaign.title,
            projectDescription: campaign.description,
            creatorName: t.name,
            targetBrand: brandName,
            strategyReason: m.strategyReason,
            recommendedAngle: m.recommendedAngle,
            objective: m.objective || campaign.objective,
            deliverables: campaign.deliverables,
            angles: campaign.angles,
            timeline: campaign.timeline,
            budgetRange: campaign.budgetRange,
            dos: m.dos || campaign.dos,
            donts: m.donts || campaign.donts,
          })),
        };
      }
    } else if (
      m.condensationGroupId ||
      m.condensationStatus === "CONDENSED" ||
      m.condensationRole === "PRIMARY" ||
      m.condensationRole === "MEMBER"
    ) {
      try {
        const briefsRes = await fetch(
          `/api/projets-outreach/condensation-briefs?missionId=${encodeURIComponent(m.id)}`,
          { credentials: "include", signal }
        );
        const briefsData = await briefsRes.json().catch(() => ({}));
        if (
          briefsRes.ok &&
          Array.isArray(briefsData.condensationBriefs) &&
          briefsData.condensationBriefs.length >= 2
        ) {
          const briefs = briefsData.condensationBriefs as Array<{
            talentId?: string | null;
          }>;
          projectPayload = {
            sharedProject: false,
            projectBriefs: briefsData.condensationBriefs,
          };
          const fromBriefs = briefs
            .map((b) => String(b.talentId || "").trim())
            .filter(Boolean);
          if (fromBriefs.length > 0) talentIds = Array.from(new Set(fromBriefs));
        }
      } catch {
        // fallback mono
      }
    }

    return { projectPayload, talentIds: talentIds.slice(0, 8) };
  }

  function missionLabel(m: Mission): string {
    return (m.marqueNom || m.targetBrand || "").trim() || "marque";
  }

  function startBatchProgress(
    phase: "marques" | "talents",
    total: number,
    current: string,
    opts?: { isRetry?: boolean }
  ) {
    setBatchResearch({
      running: true,
      phase,
      done: 0,
      total,
      phaseDone: 0,
      phaseTotal: total,
      current: opts?.isRetry ? `Relance · ${current}` : current,
      failed: 0,
      failedNames: [],
      isRetry: Boolean(opts?.isRetry),
    });
  }

  function bumpBatchProgress(args: {
    phase: "marques" | "talents";
    done: number;
    total: number;
    current: string;
    failed: number;
    failedNames?: string[];
    isRetry?: boolean;
  }) {
    setBatchResearch({
      running: true,
      phase: args.phase,
      done: args.done,
      total: args.total,
      phaseDone: args.done,
      phaseTotal: args.total,
      current: args.isRetry ? `Relance · ${args.current}` : args.current,
      failed: args.failed,
      failedNames: args.failedNames || [],
      isRetry: Boolean(args.isRetry),
    });
  }

  /** Relance auto : uniquement les missions en échec, jusqu’à maxAttempts fois. */
  async function retryFailedOnly(
    label: string,
    failed: Mission[],
    runWave: (
      wave: Mission[],
      waveOpts?: { isRetry?: boolean }
    ) => Promise<{ failedMissions: Mission[] }>,
    ac: AbortController,
    maxAttempts = 2
  ): Promise<Mission[]> {
    let pending = failed;
    for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt++) {
      if (ac.signal.aborted) break;
      const names = pending.map(missionLabel).join(", ");
      setSuccess(
        `Relance auto ${attempt}/${maxAttempts} — uniquement : ${names}`
      );
      await new Promise((r) => setTimeout(r, 600));
      if (ac.signal.aborted) break;
      const retry = await runWave(pending, { isRetry: true });
      pending = retry.failedMissions;
    }
    return pending;
  }

  type BatchRunOpts = { quiet?: boolean };

  /** Même logique que le composer : d’abord les marques. @returns false si abort. */
  async function runBatchBrandResearch(opts?: BatchRunOpts): Promise<boolean> {
    if (batchResearch?.running) return false;
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à analyser pour l’instant.");
      return true;
    }
    const targets = brandsToBatchResearch.filter(
      (m) => !hasBrandCacheEntry(brandResearchCache, m.marqueNom, m.targetBrand)
    );
    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Toutes les marques sont déjà analysées (${brandCacheCount}). Tu peux lancer les talents.`
        );
      }
      return true;
    }

    batchAbortRef.current?.abort();
    const ac = new AbortController();
    batchAbortRef.current = ac;

    const analyzeOne = async (m: Mission): Promise<boolean> => {
      const brandName = (m.marqueNom || m.targetBrand || "").trim();
      const { projectPayload } = await buildProjectPayloadForMission(
        m,
        brandName,
        ac.signal
      );
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          brandName,
          availabilityFocus: "FR",
          ...projectPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Analyse marque impossible"
        );
      }
      cacheBrandResearch(brandName, data as CachedBrandResearch);
      return true;
    };

    const runWave = async (wave: Mission[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: Mission[] = [];
      startBatchProgress(
        "marques",
        wave.length,
        wave[0]?.marqueNom || wave[0]?.targetBrand || ""
      );
      await mapPool(wave, 2, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = (m.marqueNom || m.targetBrand || "").trim();
        bumpBatchProgress({
          phase: "marques",
          done,
          total: wave.length,
          current: brandName,
          failed,
        });
        try {
          await analyzeOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Batch brand-research ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            bumpBatchProgress({
              phase: "marques",
              done,
              total: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    try {
      let result = await runWave(targets);
      // 1 retry auto sur les échecs (timeouts x.ai fréquents).
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} marque(s) en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(
          (m) => m.marqueNom || m.targetBrand
        );
        const ok =
          targets.length - stillFailed.length;
        setBatchResearch(null);
        if (stillFailed.length > 0) {
          setError(
            `Marques OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}. Relance « Analyser toutes les marques ».`
          );
        } else if (!opts?.quiet) {
          setSuccess(
            `Marques OK (${targets.length}, dont ${result.failedMissions.length} en retry). Ensuite : Analyser tous les talents.`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      if (!opts?.quiet) {
        setSuccess(
          `Marques OK (${result.done}). Ensuite : Analyser tous les talents.`
        );
      }
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      setError(e instanceof Error ? e.message : "Batch marques impossible.");
      return false;
    }
  }

  /** Même logique que le composer : talents seulement après analyse marque. */
  async function runBatchTalentResearch(opts?: BatchRunOpts): Promise<boolean> {
    if (batchResearch?.running) return false;
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à analyser pour l’instant.");
      return true;
    }

    const brandCacheNow = {
      ...brandResearchCache,
      ...loadBrandResearchCache(campaign.id),
    };
    const withBrand = brandsToBatchResearch.filter((m) =>
      hasBrandCacheEntry(brandCacheNow, m.marqueNom, m.targetBrand)
    );
    if (withBrand.length === 0) {
      if (!opts?.quiet) {
        setError("Analyse d’abord les marques (bouton « Analyser toutes les marques »).");
      }
      return false;
    }

    const talentCacheNow = {
      ...talentResearchCache,
      ...loadTalentResearchCache(campaign.id),
    };
    const targets = withBrand.filter((m) => {
      const hit = lookupBrandCache(talentCacheNow, m.marqueNom, m.targetBrand);
      return !(Array.isArray(hit) && hit.length > 0);
    });
    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(`Tous les talents sont déjà analysés (${talentCacheCount}).`);
      }
      return true;
    }

    batchAbortRef.current?.abort();
    const ac = new AbortController();
    batchAbortRef.current = ac;

    const analyzeOne = async (m: Mission) => {
      const brandName = (m.marqueNom || m.targetBrand || "").trim();
      const { projectPayload, talentIds } = await buildProjectPayloadForMission(
        m,
        brandName,
        ac.signal
      );
      // Filet : toujours au moins le talent du projet (évite 0 id sur MEMBER condensé).
      const ids =
        talentIds.length > 0
          ? talentIds
          : [campaign.talent.id].filter(Boolean);
      if (ids.length === 0) {
        throw new Error("Aucun talent pour cette marque");
      }
      const res = await fetch("/api/casting/talent-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          brandName,
          talentIds: ids,
          strategyReason: m.strategyReason || "",
          recommendedAngle: m.recommendedAngle || "",
          ...projectPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Analyse talent impossible"
        );
      }
      const list = Array.isArray(data.talents)
        ? (data.talents as CachedTalentResearchItem[])
        : [];
      if (list.length === 0) throw new Error("Réponse talents vide");
      cacheTalentResearch(brandName, list);
    };

    const runWave = async (wave: Mission[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: Mission[] = [];
      startBatchProgress(
        "talents",
        wave.length,
        wave[0]?.marqueNom || wave[0]?.targetBrand || ""
      );
      await mapPool(wave, 2, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = (m.marqueNom || m.targetBrand || "").trim();
        bumpBatchProgress({
          phase: "talents",
          done,
          total: wave.length,
          current: brandName,
          failed,
        });
        try {
          await analyzeOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Batch talent-research ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            bumpBatchProgress({
              phase: "talents",
              done,
              total: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    try {
      const result = await runWave(targets);
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} talent(s)/marque en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(
          (m) => m.marqueNom || m.targetBrand
        );
        const ok = targets.length - stillFailed.length;
        setBatchResearch(null);
        if (stillFailed.length > 0) {
          setError(
            `Talents OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}. Relance « Analyser tous les talents ».`
          );
        } else if (!opts?.quiet) {
          setSuccess(
            `Talents OK (${targets.length}, dont ${result.failedMissions.length} en retry). Boîte mail peut tourner en parallèle.`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      if (!opts?.quiet) {
        setSuccess(
          `Talents OK (${result.done}). Boîte mail peut tourner en parallèle.`
        );
      }
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      setError(e instanceof Error ? e.message : "Batch talents impossible.");
      return false;
    }
  }

  /**
   * Scan boîte Leyna — indépendant des talents (peut tourner en parallèle).
   * Requis : marques analysées (pour cibler les mêmes lignes projet).
   */
  async function runBatchLeynaExchange(opts?: BatchRunOpts): Promise<boolean> {
    if (batchLeyna?.running) return false;
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à analyser pour l’instant.");
      return true;
    }
    const brandCacheNow = {
      ...brandResearchCache,
      ...loadBrandResearchCache(campaign.id),
    };
    const withBrand = brandsToBatchResearch.filter((m) =>
      hasBrandCacheEntry(brandCacheNow, m.marqueNom, m.targetBrand)
    );
    if (withBrand.length === 0) {
      if (!opts?.quiet) setError("Analyse d’abord les marques.");
      return false;
    }

    const leynaCacheNow = {
      ...leynaExchangeCache,
      ...loadLeynaExchangeCache(campaign.id),
    };
    const targets = withBrand.filter(
      (m) => !hasBrandCacheEntry(leynaCacheNow, m.marqueNom, m.targetBrand)
    );
    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Boîte mail déjà scannée (${leynaCacheCount}/${withBrand.length}).`
        );
      }
      return true;
    }

    batchLeynaAbortRef.current?.abort();
    const ac = new AbortController();
    batchLeynaAbortRef.current = ac;

    const analyzeOne = async (m: Mission) => {
      const brandName = (m.marqueNom || m.targetBrand || "").trim();
      const emails = effectiveMissionContacts(m)
        .map((c) => String(c.email || "").trim())
        .filter((e) => e.includes("@"));
      const talentCacheLive = {
        ...talentResearchCache,
        ...loadTalentResearchCache(campaign.id),
      };
      const talentCached =
        lookupBrandCache(talentCacheLive, brandName, m.marqueNom, m.targetBrand) ||
        [];
      const talentNames = talentCached.map((t) => t.name);
      const res = await fetch("/api/casting/leyna-exchange-context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          recipientEmails: emails,
          brandName,
          talentNames:
            talentNames.length > 0
              ? talentNames
              : [campaign.talent.name].filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Scan boîte mail impossible"
        );
      }
      const ctx = (data?.context || {
        hasExchange: false,
      }) as CachedLeynaExchange;
      cacheLeynaExchange(brandName, {
        hasExchange: Boolean(ctx.hasExchange),
        tone: ctx.tone ?? null,
        bannerLabel: ctx.bannerLabel ?? null,
        contacts: Array.isArray(ctx.contacts) ? ctx.contacts : [],
      });
    };

    const runWave = async (wave: Mission[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: Mission[] = [];
      setBatchLeyna({
        running: true,
        done: 0,
        total: wave.length,
        current: wave[0]?.marqueNom || wave[0]?.targetBrand || "",
        failed: 0,
      });
      await mapPool(wave, 2, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = (m.marqueNom || m.targetBrand || "").trim();
        setBatchLeyna({
          running: true,
          done,
          total: wave.length,
          current: brandName,
          failed,
        });
        try {
          await analyzeOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Batch leyna-exchange ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            setBatchLeyna({
              running: true,
              done,
              total: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    try {
      const result = await runWave(targets);
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} boîte mail en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(
          (m) => m.marqueNom || m.targetBrand
        );
        const ok = targets.length - stillFailed.length;
        setBatchLeyna(null);
        if (stillFailed.length > 0) {
          setError(
            `Boîte mail OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}. Relance « Analyser boîte mail ».`
          );
        } else if (!opts?.quiet) {
          setSuccess(
            `Boîte mail OK (${targets.length}, dont ${result.failedMissions.length} en retry).`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchLeyna(null);
      if (!opts?.quiet) setSuccess(`Boîte mail OK (${result.done}).`);
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchLeyna(null);
      setError(e instanceof Error ? e.message : "Batch boîte mail impossible.");
      return false;
    }
  }

  /**
   * Rédige les mails (generate-email) et les pose en « À valider »
   * pour que casting n’ait plus qu’à relire / corriger.
   */
  async function runBatchDraftEmails(opts?: BatchRunOpts): Promise<boolean> {
    if (batchDraft?.running) return false;
    if (waveBlocksCasting) {
      if (!opts?.quiet) {
        setError(
          "Casting bloquée : Strategy n’a pas encore validé la vague / condensations."
        );
      }
      return false;
    }
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à rédiger pour l’instant.");
      return true;
    }

    const brandCacheNow = {
      ...brandResearchCache,
      ...loadBrandResearchCache(campaign.id),
    };
    const talentCacheNow = {
      ...talentResearchCache,
      ...loadTalentResearchCache(campaign.id),
    };
    type BatchTalent = {
      id: string;
      name: string;
      prenom?: string;
      nom?: string;
      instagram?: string | null;
      niches?: string[];
      igFollowers?: number;
      ttFollowers?: number;
    };
    const campaignTalentById = new Map<string, BatchTalent>(
      (campaign.talents && campaign.talents.length > 0
        ? campaign.talents
        : [
            {
              id: campaign.talent.id,
              name: campaign.talent.name,
              instagram: campaign.talent.instagram,
              niches: [] as string[],
              igFollowers: 0,
              ttFollowers: 0,
            },
          ]
      ).map((t) => [t.id, t])
    );

    const targets = brandsToBatchResearch.filter((m) => {
      if (m.awaitingContactsCompletion || brandCooldownActive(m)) return false;
      if (m.sentAt || m.stage === "SENT") return false;
      // Déjà prêt pour relecture casting → skip
      if (
        m.stage === "DRAFTED_FOR_VALIDATION" &&
        String(m.draftEmailSubject || "").trim() &&
        String(m.draftEmailBody || "").trim()
      ) {
        return false;
      }
      if (!hasBrandCacheEntry(brandCacheNow, m.marqueNom, m.targetBrand)) {
        return false;
      }
      const talentHit = lookupBrandCache(
        talentCacheNow,
        m.marqueNom,
        m.targetBrand
      );
      if (!(Array.isArray(talentHit) && talentHit.length > 0)) return false;
      return true;
    });

    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          "Rien à rédiger (déjà à valider, ou analyses marque/talents manquantes, ou sans contacts)."
        );
      }
      return true;
    }

    batchDraftAbortRef.current?.abort();
    const ac = new AbortController();
    batchDraftAbortRef.current = ac;

    const resolveContacts = async (m: Mission) => {
      let local = effectiveMissionContacts(m);
      const brand = (m.marqueNom || m.targetBrand || "").trim();
      if (brand.length >= 2) {
        try {
          const res = await fetch(
            `/api/marques/contacts?brand=${encodeURIComponent(brand)}`,
            { credentials: "include", signal: ac.signal }
          );
          const data = await res.json().catch(() => ({}));
          if (res.ok && Array.isArray(data.contacts)) {
            const live = (
              data.contacts as Array<{
                id?: string;
                firstname?: string;
                lastname?: string;
                email?: string;
                role?: string;
                language?: string;
              }>
            )
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
              .filter((c) => c.email.includes("@"));
            if (live.length > 0) local = live;
          }
        } catch {
          // snapshot campagne
        }
      }
      return local.filter((c) => String(c.email || "").includes("@"));
    };

    const draftOne = async (m: Mission) => {
      const brandName = (m.marqueNom || m.targetBrand || "").trim();
      const brandResearch = lookupBrandCache(
        brandCacheNow,
        m.marqueNom,
        m.targetBrand,
        brandName
      );
      const talentResearchAll =
        lookupBrandCache(
          talentCacheNow,
          m.marqueNom,
          m.targetBrand,
          brandName
        ) || [];
      if (!brandResearch) throw new Error("Analyse marque manquante");

      const contacts = await resolveContacts(m);
      if (contacts.length === 0) {
        throw new Error("Aucun contact email");
      }

      const { projectPayload, talentIds } = await buildProjectPayloadForMission(
        m,
        brandName,
        ac.signal
      );
      const ids =
        talentIds.length > 0
          ? talentIds
          : [campaign.talent.id].filter(Boolean);

      // Même payload talents que CastingComposer (ordre = briefs / sélection).
      const talentsPayload = ids.map((id) => {
        const t = campaignTalentById.get(id);
        const prenom = String(t?.prenom || "").trim();
        const nom = String(t?.nom || "").trim();
        const name =
          prenom || nom
            ? `${prenom} ${nom}`.trim()
            : t?.name || campaign.talent.name;
        const ig = typeof t?.igFollowers === "number" ? t.igFollowers : 0;
        const tt = typeof t?.ttFollowers === "number" ? t.ttFollowers : 0;
        return {
          talentId: id,
          name,
          niche: (t?.niches || []).join(", ") || "—",
          followers: Math.max(ig, tt),
          igFollowers: ig,
          ttFollowers: tt,
          instagram: t?.instagram ?? campaign.talent.instagram ?? null,
        };
      });
      if (talentsPayload.length === 0) {
        throw new Error("Aucun talent");
      }

      // Même filtre que le composer : recherche créateur des talents du mail uniquement.
      const idSet = new Set(ids);
      const talentResearch = talentResearchAll
        .filter((r) => !r.talentId || idSet.has(r.talentId))
        .map((r) => ({
          talentId: r.talentId,
          name: r.name,
          whoTheyAre: r.whoTheyAre,
          whatTheyDo: r.whatTheyDo,
          profileAnalysis: r.profileAnalysis,
          contentThemes: r.contentThemes,
          whyRelevant: r.whyRelevant,
          proofPoints: r.proofPoints,
          sourcesUsed: r.sourcesUsed,
        }));
      if (talentResearch.length === 0) {
        throw new Error("Analyse talents manquante pour ces profils");
      }

      // Aligné CastingComposer : nettoie projectBriefs comme à la rédaction manuelle.
      const rawBriefs = Array.isArray(
        (projectPayload as { projectBriefs?: unknown[] }).projectBriefs
      )
        ? ((projectPayload as { projectBriefs: Array<Record<string, unknown>> })
            .projectBriefs)
        : null;
      const sharedProject = Boolean(
        (projectPayload as { sharedProject?: boolean }).sharedProject
      );
      const projectPart =
        rawBriefs && rawBriefs.length >= 2
          ? {
              sharedProject,
              projectBriefs: rawBriefs.map((b) => ({
                projectTitle: (b.projectTitle as string) || null,
                projectDescription: (b.projectDescription as string) || null,
                creatorName: (b.creatorName as string) || null,
                targetBrand:
                  (b.targetBrand as string) || m.targetBrand || brandName || null,
                strategyReason: (b.strategyReason as string) || null,
                recommendedAngle: (b.recommendedAngle as string) || null,
                objective: (b.objective as string) || null,
                deliverables: (b.deliverables as string) || null,
                angles: (b.angles as string) || null,
                timeline: (b.timeline as string) || null,
                budgetRange: (b.budgetRange as string) || null,
                dos: (b.dos as string) || null,
                donts: (b.donts as string) || null,
              })),
            }
          : {
              projectBrief: {
                projectTitle: campaign.title || null,
                projectDescription: campaign.description || null,
                creatorName:
                  talentsPayload.map((t) => t.name).join(", ") ||
                  campaign.talent.name,
                targetBrand: m.targetBrand || brandName,
                strategyReason: m.strategyReason || null,
                recommendedAngle: m.recommendedAngle || null,
                objective: m.objective || campaign.objective || null,
                deliverables: campaign.deliverables || null,
                angles: campaign.angles || null,
                timeline: campaign.timeline || null,
                budgetRange: campaign.budgetRange || null,
                dos: m.dos || campaign.dos || null,
                donts: m.donts || campaign.donts || null,
              },
            };

      const lang = deriveClientLanguage(contacts, m.clientLanguage);
      const genLanguage = lang === "EN" ? "en" : "fr";
      const recipientEmails = contacts
        .map((c) => String(c.email || "").trim())
        .filter((e) => e.includes("@"));

      // Même endpoint + mêmes champs que le bouton « Rédiger » du composer.
      const res = await fetch("/api/casting/generate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          language: genLanguage,
          market: "FR",
          availabilityFocus: "FR",
          brandName,
          brandResearch,
          talents: talentsPayload,
          recipientEmails,
          talentResearch,
          ...projectPart,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Rédaction impossible"
        );
      }
      const subject = String(data.subject || "").trim();
      const body = String(data.body || "").trim();
      if (!subject || !body) throw new Error("Brouillon vide");

      await patchMission(m.id, {
        stage: "DRAFTED_FOR_VALIDATION",
        status: "EMAIL_DRAFTED",
        draftEmailSubject: subject,
        draftEmailBody: body,
        draftLanguage: genLanguage,
        clientContacts: contacts.map((c) => ({
          firstname: c.firstname || "",
          lastname: c.lastname || "",
          email: c.email,
          role: c.role || "",
        })),
      });
    };

    const runWave = async (wave: Mission[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: Mission[] = [];
      setBatchDraft({
        running: true,
        done: 0,
        total: wave.length,
        current: wave[0]?.marqueNom || wave[0]?.targetBrand || "",
        failed: 0,
      });
      // 1 à la fois : generate-email est lourd (Grok + Gmail)
      await mapPool(wave, 1, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = (m.marqueNom || m.targetBrand || "").trim();
        setBatchDraft({
          running: true,
          done,
          total: wave.length,
          current: brandName,
          failed,
        });
        try {
          await draftOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Batch draft ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            setBatchDraft({
              running: true,
              done,
              total: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    try {
      const result = await runWave(targets);
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} rédaction(s) en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(
          (m) => m.marqueNom || m.targetBrand
        );
        const ok = targets.length - stillFailed.length;
        setBatchDraft(null);
        await onChanged();
        if (stillFailed.length > 0) {
          setError(
            `Rédaction OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}.`
          );
        } else if (!opts?.quiet) {
          setSuccess(
            `Mails rédigés (${targets.length}) — à valider / corriger par casting.`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchDraft(null);
      await onChanged();
      if (!opts?.quiet) {
        setSuccess(
          `Mails rédigés (${result.done}) — à valider / corriger par casting.`
        );
      }
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchDraft(null);
      setError(e instanceof Error ? e.message : "Batch rédaction impossible.");
      return false;
    }
  }

  /**
   * Un clic : marques → talents → Leyna → rédaction.
   * Casting n’a plus qu’à ouvrir et corriger.
   */
  async function runBatchFullPipeline() {
    if (
      batchResearch?.running ||
      batchLeyna?.running ||
      batchDraft?.running ||
      batchPipelineActiveRef.current
    ) {
      return;
    }
    if (brandsToBatchResearch.length === 0) {
      setSuccess("Aucune marque à analyser pour l’instant.");
      return;
    }
    batchPipelineActiveRef.current = true;
    setError(null);
    try {
      setBatchPipeline({ running: true, step: 1, label: "Marques" });
      const brandsOk = await runBatchBrandResearch({ quiet: true });
      if (!batchPipelineActiveRef.current || !brandsOk) return;

      setBatchPipeline({ running: true, step: 2, label: "Talents" });
      const talentsOk = await runBatchTalentResearch({ quiet: true });
      if (!batchPipelineActiveRef.current || !talentsOk) return;

      setBatchPipeline({ running: true, step: 3, label: "Boîte mail Leyna" });
      await runBatchLeynaExchange({ quiet: true });
      if (!batchPipelineActiveRef.current) return;

      setBatchPipeline({ running: true, step: 4, label: "Rédaction mails" });
      await runBatchDraftEmails({ quiet: true });
      if (!batchPipelineActiveRef.current) return;

      setSuccess(
        "Pipeline terminé (marque → talents → Leyna → mails). Casting peut relire et corriger."
      );
    } finally {
      batchPipelineActiveRef.current = false;
      setBatchPipeline(null);
    }
  }

  function stopBatchResearch() {
    batchPipelineActiveRef.current = false;
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    setBatchResearch(null);
    setBatchPipeline(null);
    setSuccess("Analyse marques/talents interrompue — cache conservé.");
  }

  function stopBatchLeyna() {
    batchPipelineActiveRef.current = false;
    batchLeynaAbortRef.current?.abort();
    batchLeynaAbortRef.current = null;
    setBatchLeyna(null);
    setBatchPipeline(null);
    setSuccess("Analyse boîte mail interrompue — cache conservé.");
  }

  function stopBatchDraft() {
    batchPipelineActiveRef.current = false;
    batchDraftAbortRef.current?.abort();
    batchDraftAbortRef.current = null;
    setBatchDraft(null);
    setBatchPipeline(null);
    setSuccess("Rédaction interrompue — brouillons déjà sauvés conservés.");
  }

  function stopBatchPipeline() {
    batchPipelineActiveRef.current = false;
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    batchLeynaAbortRef.current?.abort();
    batchLeynaAbortRef.current = null;
    batchDraftAbortRef.current?.abort();
    batchDraftAbortRef.current = null;
    setBatchResearch(null);
    setBatchLeyna(null);
    setBatchDraft(null);
    setBatchPipeline(null);
    setSuccess("Pipeline interrompu — cache / brouillons conservés.");
  }

  async function requestCompletion(m: Mission) {
    if (!m.marqueId) {
      setError("Cette marque n’est pas liée à une fiche CRM — lie-la d’abord depuis le CRM.");
      return;
    }
    const contactCount = effectiveMissionContacts(m).length;
    const note = window.prompt(
      `Que faut-il compléter sur « ${m.marqueNom || m.targetBrand} » ?`,
      contactCount === 0
        ? "Aucun contact — merci d’ajouter les bons interlocuteurs sur la fiche existante."
        : "Un seul contact — merci d’ajouter d’autres interlocuteurs pertinents sur la fiche existante."
    );
    if (note === null) return;

    setRequestingId(m.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/request-marque-completion`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marqueId: m.marqueId,
            missionId: m.id,
            note: note.trim() || undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Demande impossible."
        );
      }
      setSuccess(
        typeof data.message === "string"
          ? data.message
          : "Demande envoyée pour compléter la fiche."
      );
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setRequestingId(null);
    }
  }

  async function resolveCompletion(m: Mission) {
    setRequestingId(m.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/resolve-marque-completion`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missionId: m.id }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Déblocage impossible."
        );
      }
      setSuccess(
        typeof data.message === "string" ? data.message : "Rédaction débloquée."
      );
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setRequestingId(null);
    }
  }

  async function openComposer(m: Mission) {
    if (waveBlocksCasting) {
      setError(
        campaign.wave?.status === "COLLECTING"
          ? "Casting bloquée : Strategy n’a pas encore terminé la vague de collecte."
          : "Casting bloquée : Strategy doit valider les condensations de la vague."
      );
      return;
    }
    if (m.sentAt || m.stage === "SENT") {
      setError(
        `« ${m.marqueNom || m.targetBrand} » a déjà été contactée (condensation).`
      );
      return;
    }
    if (m.awaitingContactsCompletion) {
      setError(
        `« ${m.marqueNom || m.targetBrand} » est en attente de contacts. Impossible de rédiger tant que ce n’est pas débloqué.`
      );
      return;
    }
    if (brandCooldownActive(m)) {
      setError(
        m.brandCooldownReason ||
          `« ${m.marqueNom || m.targetBrand} » est en attente jusqu’au ${brandCooldownLabel(m)} (déjà contactée récemment).`
      );
      return;
    }
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

    let condensationBriefs: ComposerContact["missionBrief"]["condensationBriefs"] = null;
    let sharedProject = false;

    if (campaign.mode === "MULTI" && (campaign.talents?.length || 0) >= 2) {
      const all = campaign.talents || [];
      const selected =
        Array.isArray(m.selectedTalentIds) && m.selectedTalentIds.length > 0
          ? all.filter((t) => m.selectedTalentIds!.includes(t.id))
          : all;
      const forMail = selected.length >= 1 ? selected : all;
      if (forMail.length >= 2) {
        sharedProject = true;
        condensationBriefs = forMail.map((t) => ({
          missionId: m.id,
          talentId: t.id,
          projectTitle: campaign.title,
          projectDescription: campaign.description,
          creatorName: t.name,
          targetBrand: m.targetBrand,
          strategyReason: m.strategyReason,
          recommendedAngle: m.recommendedAngle,
          objective: m.objective || campaign.objective,
          deliverables: campaign.deliverables,
          angles: campaign.angles,
          timeline: campaign.timeline,
          budgetRange: campaign.budgetRange,
          dos: m.dos || campaign.dos,
          donts: m.donts || campaign.donts,
        }));
      }
    } else if (
      m.condensationGroupId ||
      m.condensationStatus === "CONDENSED" ||
      m.condensationRole === "PRIMARY" ||
      m.condensationRole === "MEMBER" ||
      (m.condensationPeerNames && m.condensationPeerNames.length > 0)
    ) {
      try {
        const res = await fetch(
          `/api/projets-outreach/condensation-briefs?missionId=${encodeURIComponent(m.id)}`,
          { credentials: "include" }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.condensationBriefs)) {
          condensationBriefs = data.condensationBriefs;
        }
        if (!condensationBriefs || condensationBriefs.length < 2) {
          setError(
            `Condensation incomplète pour ${m.targetBrand} (${condensationBriefs?.length || 0} talent(s) chargé(s)). Réessaie ou rescane les condensations.`
          );
        }
      } catch {
        setError(`Impossible de charger les talents condensés pour ${m.targetBrand}.`);
      }
    }

    const isCondensedMail = Boolean(
      condensationBriefs && condensationBriefs.length >= 2
    );

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

    const creatorLabel =
      isCondensedMail || sharedProject
        ? (condensationBriefs || [])
            .map((b) => b.creatorName)
            .filter(Boolean)
            .join(", ") || campaign.talent.name
        : campaign.talent.name;

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
        creatorName: creatorLabel || campaign.talent.name,
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
        condensationBriefs,
        sharedProject,
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

  const presentationBlock = (
    <PresentationCard
      campaign={campaign}
      canEdit={canEditPresentation}
      onSaved={onChanged}
      onPreview={onPreviewPresentation}
      setError={setError}
      setSuccess={setSuccess}
    />
  );

  if (draftable.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {presentationBlock}
        <div className="po-empty">
          Aucune marque à rédiger. Inès doit d&apos;abord ajouter des marques.
        </div>
      </div>
    );
  }

  if (waveBlocksCasting) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {presentationBlock}
        <div
          className="po-card"
          style={{
            padding: 28,
            border: "1px solid #D4C4F7",
            background: "#F4F0FC",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "#5B3F9E" }}>
            En pause — Strategy n&apos;a pas encore validé
          </div>
          {campaign.wave?.status === "COLLECTING" ? (
            <p style={{ marginTop: 10, fontSize: 13, color: "#5B3F9E", lineHeight: 1.5 }}>
              {`La vague « ${campaign.wave.title} » n’est pas encore terminée côté Strategy. Dès qu’elle valide, tu pourras rédiger.`}
            </p>
          ) : null}
          <Link
            href="/projets-outreach"
            className="po-btn po-btn-primary"
            style={{ marginTop: 16, display: "inline-flex" }}
          >
            Voir la vague
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {presentationBlock}

      {composerOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <button
            type="button"
            onClick={() => {
              setComposerOpen(false);
              setComposerContact(null);
            }}
            className="po-btn po-btn-secondary"
            style={{
              alignSelf: "flex-start",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              fontSize: 12,
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour à la liste
          </button>
          <CastingComposer
            open={composerOpen}
            contact={composerContact}
            variant="inline"
            brandColumn="todo"
            useHubspot={false}
            allowSchedule={false}
            enableTalentResearch
            initialBrandResearch={composerInitialBrandResearch}
            onBrandResearchCached={cacheBrandResearch}
            initialTalentResearch={composerInitialTalentResearch}
            onTalentResearchCached={cacheTalentResearch}
            initialLeynaExchange={composerInitialLeynaExchange}
            onLeynaExchangeCached={cacheLeynaExchange}
            lockedTalentId={
              composerLockedTalentIds && composerLockedTalentIds.length >= 2
                ? null
                : campaign.talent.id
            }
            lockedTalentIds={composerLockedTalentIds}
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
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          className="po-card"
          style={{
            padding: "14px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--po-tertiary)",
                lineHeight: 1.45,
              }}
            >
              {batchPipeline?.running
                ? `Pipeline ${batchPipeline.step}/4 · ${batchPipeline.label} — tu peux quitter, cache + brouillons restent.`
                : "Tout analyser + rédiger : marque → talents → Leyna → mails. Casting n’a plus qu’à corriger."}
            </p>
            {(batchResearch?.running ||
              batchLeyna?.running ||
              batchDraft?.running) && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {batchResearch?.running ? (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "#5B3F9E",
                        marginBottom: 6,
                      }}
                    >
                      <span>
                        {batchPipeline?.running
                          ? `${batchPipeline.step}/4 · `
                          : ""}
                        {batchResearch.phase === "marques" ? "Marques" : "Talents"}
                        {batchResearch.current ? ` · ${batchResearch.current}` : ""}
                      </span>
                      <span>
                        {batchResearch.phaseDone}/{batchResearch.phaseTotal}
                        {batchResearch.failed > 0
                          ? ` · ${batchResearch.failed} échec${batchResearch.failed > 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: "#EEEAFB",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(
                            100,
                            Math.round(
                              (batchResearch.phaseTotal > 0
                                ? batchResearch.phaseDone / batchResearch.phaseTotal
                                : 0) * 100
                            )
                          )}%`,
                          background: "linear-gradient(90deg, #7B5CC8, #5B3F9E)",
                          borderRadius: 999,
                          transition: "width 0.35s ease",
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {batchLeyna?.running ? (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "#5B3F9E",
                        marginBottom: 6,
                      }}
                    >
                      <span>
                        {batchPipeline?.running ? "3/4 · " : ""}
                        Boîte mail
                        {batchLeyna.current ? ` · ${batchLeyna.current}` : ""}
                      </span>
                      <span>
                        {batchLeyna.done}/{batchLeyna.total}
                        {batchLeyna.failed > 0
                          ? ` · ${batchLeyna.failed} échec${batchLeyna.failed > 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: "#EEEAFB",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(
                            100,
                            Math.round(
                              (batchLeyna.total > 0
                                ? batchLeyna.done / batchLeyna.total
                                : 0) * 100
                            )
                          )}%`,
                          background: "linear-gradient(90deg, #7B5CC8, #5B3F9E)",
                          borderRadius: 999,
                          transition: "width 0.35s ease",
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {batchDraft?.running ? (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "#5B3F9E",
                        marginBottom: 6,
                      }}
                    >
                      <span>
                        {batchPipeline?.running ? "4/4 · " : ""}
                        Rédaction
                        {batchDraft.current ? ` · ${batchDraft.current}` : ""}
                      </span>
                      <span>
                        {batchDraft.done}/{batchDraft.total}
                        {batchDraft.failed > 0
                          ? ` · ${batchDraft.failed} échec${batchDraft.failed > 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: "#EEEAFB",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(
                            100,
                            Math.round(
                              (batchDraft.total > 0
                                ? batchDraft.done / batchDraft.total
                                : 0) * 100
                            )
                          )}%`,
                          background: "linear-gradient(90deg, #7B5CC8, #5B3F9E)",
                          borderRadius: 999,
                          transition: "width 0.35s ease",
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {batchPipeline?.running ||
            batchResearch?.running ||
            batchLeyna?.running ||
            batchDraft?.running ? (
              <button
                type="button"
                className="po-btn po-btn-secondary"
                onClick={
                  batchPipeline?.running
                    ? stopBatchPipeline
                    : batchResearch?.running
                      ? stopBatchResearch
                      : batchLeyna?.running
                        ? stopBatchLeyna
                        : stopBatchDraft
                }
              >
                {batchPipeline?.running
                  ? "Arrêter le pipeline"
                  : batchResearch?.running
                    ? "Arrêter marques/talents"
                    : batchLeyna?.running
                      ? "Arrêter boîte mail"
                      : "Arrêter rédaction"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="po-btn po-btn-primary"
                  disabled={brandsToBatchResearch.length === 0 || !canEdit}
                  onClick={() => void runBatchFullPipeline()}
                  title="Marque → talents → Leyna → rédaction auto (À valider)"
                >
                  Tout analyser + rédiger
                </button>
                <button
                  type="button"
                  className="po-btn po-btn-secondary"
                  disabled={brandsToBatchResearch.length === 0 || !canEdit}
                  onClick={() => void runBatchBrandResearch()}
                >
                  Marques
                </button>
                <button
                  type="button"
                  className="po-btn po-btn-secondary"
                  disabled={
                    brandsToBatchResearch.length === 0 || !canEdit || brandCacheCount === 0
                  }
                  onClick={() => void runBatchTalentResearch()}
                  title={
                    brandCacheCount === 0
                      ? "Analyse d’abord les marques"
                      : "Même logique que dans le mail"
                  }
                >
                  Talents
                </button>
                <button
                  type="button"
                  className="po-btn po-btn-secondary"
                  disabled={
                    brandsToBatchResearch.length === 0 || !canEdit || brandCacheCount === 0
                  }
                  onClick={() => void runBatchLeynaExchange()}
                  title={
                    brandCacheCount === 0
                      ? "Analyse d’abord les marques"
                      : "Peut tourner en parallèle des talents"
                  }
                >
                  Boîte mail
                </button>
                <button
                  type="button"
                  className="po-btn po-btn-secondary"
                  disabled={
                    brandsToBatchResearch.length === 0 ||
                    !canEdit ||
                    brandCacheCount === 0 ||
                    talentCacheCount === 0
                  }
                  onClick={() => void runBatchDraftEmails()}
                  title={
                    talentCacheCount === 0
                      ? "Analyse d’abord marques + talents"
                      : "Rédige les mails → statut À valider"
                  }
                >
                  Rédiger les mails
                </button>
              </>
            )}
          </div>
        </div>

      <div className="po-card po-table-scroll">
        <div
          className="po-table-head"
          style={{
            gridTemplateColumns: "minmax(200px,1.5fr) minmax(0,2fr) 120px 100px 180px",
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
          const awaiting = Boolean(m.awaitingContactsCompletion);
          const onCooldown = brandCooldownActive(m);
          const needsCompletion = Boolean(m.marqueId) && !awaiting;
          const hasBrandAnalysis = hasBrandCacheEntry(
            brandResearchCache,
            m.marqueNom,
            m.targetBrand,
            name
          );
          const talentHit = lookupBrandCache(
            talentResearchCache,
            m.marqueNom,
            m.targetBrand,
            name
          );
          const hasTalentAnalysis = Array.isArray(talentHit) && talentHit.length > 0;
          const leynaHit = lookupBrandCache(
            leynaExchangeCache,
            m.marqueNom,
            m.targetBrand,
            name
          );
          const hasLeynaAnalysis = leynaHit != null;
          return (
            <div
              key={m.id}
              className="po-table-row"
              style={{
                gridTemplateColumns: "minmax(200px,1.5fr) minmax(0,2fr) 120px 100px 180px",
                background:
                  awaiting || onCooldown ? "var(--po-prio-med-bg)" : undefined,
              }}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <PoAvatar name={name} size={26} />
                <div className="min-w-0 flex-1">
                  <div
                    style={{ fontWeight: 600, color: "var(--po-ink)", lineHeight: 1.25 }}
                    className="truncate"
                    title={name}
                  >
                    {name}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hasBrandAnalysis ? (
                      <span
                        title="Analyse marque en cache"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#1F6B4A",
                          background: "#E5F6EE",
                          borderRadius: 999,
                          padding: "2px 7px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Marque ✓
                      </span>
                    ) : null}
                    {hasTalentAnalysis ? (
                      <span
                        title="Analyse talents en cache"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#5B3F9E",
                          background: "#EEEAFB",
                          borderRadius: 999,
                          padding: "2px 7px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Talents ✓
                      </span>
                    ) : null}
                    {hasLeynaAnalysis ? (
                      <span
                        title={
                          leynaHit?.hasExchange
                            ? leynaHit.bannerLabel || "Échange Leyna trouvé"
                            : "Boîte Leyna scannée — aucun échange"
                        }
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: leynaHit?.hasExchange ? "#5B3F9E" : "#6B5B4A",
                          background: leynaHit?.hasExchange ? "#EEEAFB" : "#F3EEE6",
                          borderRadius: 999,
                          padding: "2px 7px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {leynaHit?.hasExchange ? "Leyna ✓" : "Leyna —"}
                      </span>
                    ) : null}
                    {onCooldown ? (
                      <span
                        title={m.brandCooldownReason || undefined}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#956A15",
                          background: "#FBF1DC",
                          borderRadius: 999,
                          padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Attente · {brandCooldownLabel(m)}
                      </span>
                    ) : null}
                    {m.condensationStatus === "CONDENSED" ||
                    m.condensationRole === "PRIMARY" ||
                    m.condensationRole === "MEMBER" ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#5B3F9E",
                          background: "#EEEAFB",
                          borderRadius: 999,
                          padding: "2px 7px",
                        }}
                        title={
                          m.condensationPeerNames && m.condensationPeerNames.length > 0
                            ? `Avec ${m.condensationPeerNames.join(", ")}`
                            : undefined
                        }
                      >
                        {m.condensationPeerNames && m.condensationPeerNames.length > 0
                          ? `Avec ${m.condensationPeerNames.join(", ")}`
                          : "Condensée · 1 mail"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div
                className="truncate"
                style={{ color: "var(--po-tertiary)", fontSize: 12.5 }}
                title={m.strategyReason || undefined}
              >
                {m.strategyReason || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--po-tertiary)" }}>
                {awaiting ? (
                  <StageDotBadge label="En attente contacts" />
                ) : onCooldown ? (
                  <StageDotBadge label={`Attente · ${brandCooldownLabel(m)}`} />
                ) : (
                  <StageDotBadge label={STAGE_LABEL[m.stage] || m.stage} />
                )}
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color:
                      awaiting || onCooldown
                        ? "var(--po-prio-med-fg)"
                        : "var(--po-muted)",
                    fontWeight: awaiting || onCooldown ? 600 : 400,
                  }}
                >
                  {contactCount} contact(s)
                </div>
              </div>
              <div>
                <PriorityBadge priority={m.priority} />
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {awaiting && isAdmin ? (
                  <>
                    {m.marqueId ? (
                      <Link
                        href={`/marques/${m.marqueId}`}
                        className="po-btn po-btn-primary"
                        style={{
                          padding: "7px 10px",
                          fontSize: 12,
                          textDecoration: "none",
                        }}
                        title="Ouvrir la fiche marque"
                      >
                        À compléter
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || requestingId === m.id}
                      onClick={() => void resolveCompletion(m)}
                      className="po-btn"
                      style={{ padding: "7px 10px", fontSize: 12 }}
                      title="Après complétion CRM, débloque la rédaction"
                    >
                      {requestingId === m.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Contacts prêts"
                      )}
                    </button>
                  </>
                ) : null}
                {needsCompletion && (
                  <button
                    type="button"
                    disabled={busy || requestingId === m.id}
                    onClick={() => void requestCompletion(m)}
                    className="po-btn po-btn-secondary"
                    style={{ padding: "7px 10px", fontSize: 12 }}
                    title="Notifie tous les admins et bloque la rédaction"
                  >
                    {requestingId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Compléter"
                    )}
                  </button>
                )}
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy || awaiting || onCooldown}
                    onClick={() => void openComposer(m)}
                    className="po-btn po-btn-primary po-btn-cta-accent"
                    style={{
                      padding: "7px 12px",
                      fontSize: 12,
                      opacity: awaiting || onCooldown ? 0.45 : 1,
                    }}
                    title={
                      awaiting
                        ? "Bloqué — contacts en attente"
                        : onCooldown
                          ? m.brandCooldownReason ||
                            `En attente jusqu’au ${brandCooldownLabel(m)}`
                          : m.draftEmailSubject
                            ? "Ouvrir le composer"
                            : "Rédiger le mail"
                    }
                  >
                    {awaiting || onCooldown
                      ? "Bloqué"
                      : m.draftEmailSubject
                        ? "Ouvrir"
                        : "Rédiger"}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "#956A15" }}>Casting</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      )}
    </div>
  );
}

function EnvoisTab({
  campaign,
  canSendMails,
  role,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canSendMails: boolean;
  role: string;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const queue = campaign.missions.filter(
    (m) =>
      !m.sentAt &&
      m.stage !== "SENT" &&
      (m.stage === "DRAFTED_FOR_VALIDATION" ||
        m.stage === "TO_SEND" ||
        (m.scheduledSendAt && !m.sentAt))
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const waveBlocks =
    !bypassesWaveCastingGate(role) &&
    (campaign.wave?.status === "COLLECTING" ||
      campaign.wave?.status === "REVIEWING_CONDENSATIONS");

  function askUrgentForceReason(label: string, detail?: string): string | null {
    const confirmed = window.confirm(
      `${label}\n\n${
        detail ||
        "Ces contacts ont déjà reçu un mail sur la ligne projet récemment (plafond 1 / 30 j)."
      }\n\nProjet urgent — envoyer quand même ? (un motif sera demandé)`
    );
    if (!confirmed) return null;
    const reason = window.prompt(
      "Motif du projet urgent (obligatoire, min. 5 caractères) :",
      ""
    );
    if (!reason || reason.trim().length < 5) {
      setError("Envoi annulé : motif urgent trop court ou vide.");
      return null;
    }
    return reason.trim();
  }

  async function scheduleAndSend(
    missionId: string,
    force = false,
    forceReason?: string
  ) {
    if (!canSendMails) return;
    if (waveBlocks) {
      setError(
        "Envoi bloqué : la vague Strategy n’est pas encore validée (Casting fermé)."
      );
      return;
    }
    const mission = queue.find((m) => m.id === missionId);
    const brandLabel = mission?.marqueNom || mission?.targetBrand || "cette marque";
    setBusyId(missionId);
    setError(null);
    try {
      const scheduleRes = await fetch(
        `/api/strategy/contact-missions/${missionId}/schedule-send`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            force,
            ...(force && forceReason ? { forceReason } : {}),
          }),
        }
      );
      const scheduleData = await scheduleRes.json().catch(() => ({}));
      if (!scheduleRes.ok) {
        // Bloqué cooldown : demander motif puis réessayer en force.
        // Aussi si force=true sans motif (bouton « Forcer » mal câblé / refresh).
        const needsMotif =
          (scheduleData?.canForce && !force) ||
          (force && !forceReason && scheduleData?.needsForceReason);
        if (needsMotif) {
          const reason = askUrgentForceReason(
            brandLabel,
            scheduleData.error || undefined
          );
          if (!reason) return;
          setBusyId(null);
          await scheduleAndSend(missionId, true, reason);
          return;
        }
        throw new Error(scheduleData.error || "Planification impossible.");
      }

      const sendRes = await fetch(`/api/strategy/contact-missions/${missionId}/send-now`, {
        method: "POST",
        credentials: "include",
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) throw new Error(sendData.error || "Envoi impossible.");

      setSuccess(
        force
          ? `Envoyé (forcé) depuis Leyna (${sendData.succeeded ?? 0} destinataire(s)).`
          : `Envoyé depuis Leyna (${sendData.succeeded ?? 0} destinataire(s)).`
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  if (waveBlocks) {
    return (
      <div
        className="po-card"
        style={{
          padding: 28,
          border: "1px solid #D4C4F7",
          background: "#F4F0FC",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#5B3F9E" }}>
          Envois bloqués — vague Strategy non validée
        </div>
        <p style={{ marginTop: 10, fontSize: 13, color: "#5B3F9E", lineHeight: 1.5 }}>
          Aucun envoi tant que Strategy n’a pas terminé la collecte et validé les condensations.
        </p>
      </div>
    );
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
    <div className="po-card po-table-scroll">
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
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => void scheduleAndSend(m.id, false)}
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
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => {
                      const reason = askUrgentForceReason(
                        m.marqueNom || m.targetBrand,
                        "Forcer l’envoi ignore le plafond projet 30 jours (contacts déjà contactés sur cette ligne)."
                      );
                      if (reason) void scheduleAndSend(m.id, true, reason);
                    }}
                    className="po-btn po-btn-secondary"
                    style={{ padding: "7px 12px", fontSize: 12 }}
                    title="Ignore le plafond anti-spam projet (30 j)"
                  >
                    Forcer l’envoi
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Aligné sur CASTING_RELANCE_* (casting-auto-send) — jours ouvrés. */
const SUIVI_RELANCE1_BUSINESS_DAYS = 3;
const SUIVI_RELANCE2_BUSINESS_DAYS = 10;

function formatSuiviDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSuiviDay(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Prochaine relance auto prévue (J+3 ou J+10), ou null si plus rien à venir. */
function nextRelancePlan(m: Mission, campaignClosed: boolean): {
  round: 1 | 2;
  at: Date;
} | null {
  if (campaignClosed || m.relanceCancelledAt || !m.sentAt) return null;
  if (!m.relanceSentAt) {
    return {
      round: 1,
      at: businessDaysAfter(new Date(m.sentAt), SUIVI_RELANCE1_BUSINESS_DAYS),
    };
  }
  if (!m.relance2SentAt) {
    return {
      round: 2,
      at: businessDaysAfter(new Date(m.relanceSentAt), SUIVI_RELANCE2_BUSINESS_DAYS),
    };
  }
  return null;
}

function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(
    "leyna@glowupagence.fr"
  )}#all/${encodeURIComponent(threadId)}`;
}

function SuiviTab({ campaign }: { campaign: Campaign }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threadByMission, setThreadByMission] = useState<
    Record<
      string,
      {
        loading: boolean;
        error: string | null;
        replies: Array<{
          id: string;
          from: string;
          date: string | null;
          subject: string;
          body: string;
          snippet: string;
        }>;
      }
    >
  >({});
  const campaignClosed = campaign.status === "CLOSED" || !campaign.isActive;

  async function loadThreadReplies(missionId: string) {
    setThreadByMission((prev) => ({
      ...prev,
      [missionId]: {
        loading: true,
        error: null,
        replies: prev[missionId]?.replies || [],
      },
    }));
    try {
      const res = await fetch(
        `/api/projets-outreach/missions/${encodeURIComponent(missionId)}/thread`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Lecture du fil impossible."
        );
      }
      setThreadByMission((prev) => ({
        ...prev,
        [missionId]: {
          loading: false,
          error: null,
          replies: Array.isArray(data.replies) ? data.replies : [],
        },
      }));
    } catch (e) {
      setThreadByMission((prev) => ({
        ...prev,
        [missionId]: {
          loading: false,
          error: e instanceof Error ? e.message : "Erreur réseau.",
          replies: [],
        },
      }));
    }
  }

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
  const relanced = campaign.missions.filter(
    (m) => Boolean(m.relanceSentAt || m.relance2SentAt)
  ).length;

  const cols = "1.3fr .9fr .85fr .55fr .55fr 1.35fr .75fr";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="po-kpi-grid">
        <KpiCard label="Marques" value={campaign.missions.length} dot="#B67C7C" />
        <KpiCard label="Contactées" value={contacted.length} dot="#C45C26" />
        <KpiCard label="Ouvertures" value={opens} dot="#2F6FED" />
        <KpiCard label="Réponses" value={replies} dot="#2E9E63" />
        <KpiCard label="Relancées" value={relanced} dot="#5B3F9E" />
      </div>

      <div className="po-card po-table-scroll">
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
            const next = nextRelancePlan(m, campaignClosed);
            const recipients = Object.entries(m.sentMessageIds || {})
              .filter(([, rec]) => Boolean(rec?.messageId) && !rec?.error)
              .map(([email, rec]) => ({ email, ...rec }))
              .sort((a, b) => a.email.localeCompare(b.email, "fr"));
            const threadId =
              recipients.find((r) => r.threadId)?.threadId ||
              recipients.find((r) => r.messageId)?.messageId ||
              null;
            const hasPerEmailDetail = recipients.some(
              (r) => (r.openCount || 0) > 0 || (r.clickCount || 0) > 0
            );
            const canExpand =
              recipients.length > 0 ||
              m.openCount > 0 ||
              m.clickCount > 0 ||
              Boolean(m.lastClickUrl) ||
              Boolean(m.sentAt) ||
              Boolean(m.relanceSentAt);
            const isOpen = expandedId === m.id;

            const relanceLines: string[] = [];
            if (m.relanceSentAt) {
              relanceLines.push(`J+3 envoyée · ${formatSuiviDay(m.relanceSentAt)}`);
            }
            if (m.relance2SentAt) {
              relanceLines.push(`J+10 envoyée · ${formatSuiviDay(m.relance2SentAt)}`);
            }
            if (m.relanceCancelledAt && (!m.relanceSentAt || !m.relance2SentAt)) {
              relanceLines.push(`Stoppée · ${formatSuiviDay(m.relanceCancelledAt)}`);
            } else if (next) {
              const overdue = next.at.getTime() <= Date.now();
              relanceLines.push(
                overdue
                  ? `J+${next.round === 1 ? 3 : 10} imminente`
                  : `J+${next.round === 1 ? 3 : 10} prévue · ${formatSuiviDay(next.at)}`
              );
            } else if (!m.sentAt) {
              relanceLines.push("—");
            } else if (!m.relanceSentAt && !m.relance2SentAt && !relanceLines.length) {
              relanceLines.push("—");
            }

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
                    setExpandedId((prev) => {
                      const next = prev === m.id ? null : m.id;
                      if (next === m.id && !threadByMission[m.id]) {
                        void loadThreadReplies(m.id);
                      }
                      return next;
                    });
                  }}
                  disabled={!canExpand}
                >
                  <div style={{ fontWeight: 600 }}>{m.marqueNom || m.targetBrand}</div>
                  <div>
                    <StageDotBadge label={STAGE_LABEL[m.stage] || m.stage} />
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {m.sentAt ? formatSuiviDate(m.sentAt) : EMPTY}
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
                  <div style={{ fontSize: 11.5, lineHeight: 1.35, color: "var(--po-ink)" }}>
                    {relanceLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "var(--po-muted)",
                            marginBottom: 6,
                          }}
                        >
                          Fil d&apos;envoi
                        </div>
                        <ol
                          style={{
                            margin: 0,
                            paddingLeft: 18,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            color: "var(--po-ink)",
                          }}
                        >
                          <li>
                            Mail initial{" "}
                            <strong>
                              {m.sentAt ? `envoyé · ${formatSuiviDate(m.sentAt)}` : "pas encore parti"}
                            </strong>
                          </li>
                          <li>
                            Relance J+3{" "}
                            <strong>
                              {m.relanceSentAt
                                ? `envoyée · ${formatSuiviDate(m.relanceSentAt)}`
                                : next?.round === 1
                                  ? `prévue · ${formatSuiviDay(next.at)}`
                                  : m.relanceCancelledAt
                                    ? "stoppée"
                                    : "—"}
                            </strong>
                          </li>
                          <li>
                            Relance J+10{" "}
                            <strong>
                              {m.relance2SentAt
                                ? `envoyée · ${formatSuiviDate(m.relance2SentAt)}`
                                : next?.round === 2
                                  ? `prévue · ${formatSuiviDay(next.at)}`
                                  : m.relanceCancelledAt && m.relanceSentAt
                                    ? "stoppée"
                                    : m.relanceSentAt
                                      ? "en attente"
                                      : "—"}
                            </strong>
                          </li>
                          {m.replied ||
                          m.stage === "RESPONSE_RECEIVED" ||
                          m.stage === "IN_NEGOTIATION" ||
                          m.stage === "WON" ? (
                            <li>
                              Réponse client <strong>détectée</strong>
                            </li>
                          ) : null}
                        </ol>
                        {threadId ? (
                          <a
                            href={gmailThreadUrl(threadId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "inline-flex",
                              marginTop: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--po-accent)",
                              textDecoration: "underline",
                            }}
                          >
                            Ouvrir le fil dans Gmail (Leyna)
                          </a>
                        ) : null}
                      </div>

                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 6,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              color: "var(--po-muted)",
                            }}
                          >
                            Ce que la cliente a dit
                          </div>
                          <button
                            type="button"
                            className="po-btn po-btn-secondary"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              void loadThreadReplies(m.id);
                            }}
                          >
                            {threadByMission[m.id]?.loading ? "Lecture…" : "Rafraîchir"}
                          </button>
                        </div>
                        {threadByMission[m.id]?.loading ? (
                          <p
                            style={{
                              margin: 0,
                              color: "var(--po-muted)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Lecture du fil Gmail…
                          </p>
                        ) : null}
                        {threadByMission[m.id]?.error ? (
                          <p style={{ margin: 0, color: "var(--po-danger)" }}>
                            {threadByMission[m.id].error}
                          </p>
                        ) : null}
                        {!threadByMission[m.id]?.loading &&
                        !threadByMission[m.id]?.error &&
                        (threadByMission[m.id]?.replies?.length || 0) === 0 ? (
                          <p style={{ margin: 0, color: "var(--po-tertiary)" }}>
                            Pas encore de réponse client détectée dans Gmail.
                          </p>
                        ) : null}
                        {(threadByMission[m.id]?.replies || []).map((reply) => (
                          <div
                            key={reply.id}
                            style={{
                              marginTop: 8,
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid var(--po-sep)",
                              background: "#fff",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 8,
                                marginBottom: 6,
                                fontSize: 11.5,
                                color: "var(--po-tertiary)",
                              }}
                            >
                              <strong style={{ color: "var(--po-ink)" }}>{reply.from}</strong>
                              <span>{reply.date ? formatSuiviDate(reply.date) : "—"}</span>
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                fontFamily: "inherit",
                                fontSize: 13,
                                lineHeight: 1.45,
                                color: "var(--po-ink)",
                              }}
                            >
                              {reply.body}
                            </pre>
                          </div>
                        ))}
                      </div>

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
                            const tid = r.threadId || r.messageId;
                            return (
                              <div
                                key={r.email}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "minmax(0, 1.3fr) auto auto auto minmax(0, 1.4fr)",
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
                                {tid ? (
                                  <a
                                    href={gmailThreadUrl(tid)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "var(--po-accent)",
                                      textDecoration: "underline",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Fil Gmail
                                  </a>
                                ) : (
                                  <span style={{ color: "var(--po-muted)" }}>—</span>
                                )}
                                <span className="truncate" style={{ color: "var(--po-tertiary)" }}>
                                  {r.lastClickUrl ? (
                                    <a
                                      href={r.lastClickUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: "var(--po-accent)",
                                        textDecoration: "underline",
                                      }}
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
                        <p style={{ margin: 0, color: "var(--po-tertiary)" }}>
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

function PresentationCard({
  campaign,
  canEdit,
  onSaved,
  onPreview,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onPreview: () => void;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [togglingAttach, setTogglingAttach] = useState(false);
  const hasPdf = Boolean(campaign.presentationPdfUrl);
  const attachInEmails = campaign.includePresentationInEmails !== false;

  async function setAttachInEmails(next: boolean) {
    if (!canEdit || !hasPdf) return;
    setTogglingAttach(true);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaign.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePresentationInEmails: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible.");
      setSuccess(
        next
          ? "PDF joint aux prochains mails de prospection."
          : "PDF non joint aux mails (aperçu seul)."
      );
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setTogglingAttach(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/presentation`,
        { method: "POST", credentials: "include", body: fd }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload impossible.");
      setSuccess("Présentation PDF ajoutée.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removePresentation() {
    if (!hasPdf) return;
    if (!window.confirm("Retirer la présentation PDF de ce projet ?")) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaign.id}/presentation`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      setSuccess("Présentation retirée.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      id="presentation-projet"
      className="po-card"
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        border: hasPdf ? "1px solid color-mix(in oklab, var(--po-accent) 35%, white)" : undefined,
        background: hasPdf
          ? "color-mix(in oklab, var(--po-accent) 6%, white)"
          : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: hasPdf ? "var(--po-accent-14)" : "#F4F4F5",
              color: hasPdf ? "var(--po-accent)" : "var(--po-muted)",
              flexShrink: 0,
            }}
          >
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--po-ink)",
                lineHeight: 1.3,
              }}
            >
              Présentation du projet
            </div>
            <div
              style={{
                marginTop: 3,
                fontSize: 12.5,
                color: "var(--po-muted)",
                lineHeight: 1.4,
              }}
            >
              {hasPdf
                ? attachInEmails
                  ? "PDF prêt — joint automatiquement aux mails de prospection (Casting / Leyna)."
                  : "PDF prêt — aperçu seul (non joint aux mails tant que le toggle est off)."
                : "Ajoute le deck / PDF de présentation de ce projet (Admin, TM, Casting, Strategy…)."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {hasPdf && (
            <button
              type="button"
              className="po-btn po-btn-primary"
              onClick={onPreview}
            >
              <Eye className="h-4 w-4" />
              Aperçu
            </button>
          )}
          {hasPdf && (
            <a
              href={campaign.presentationPdfUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="po-btn po-btn-secondary"
            >
              <ExternalLink className="h-4 w-4" />
              Ouvrir
            </a>
          )}
          {canEdit && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <button
                type="button"
                className={hasPdf ? "po-btn po-btn-secondary" : "po-btn po-btn-primary"}
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {hasPdf ? "Remplacer" : "Ajouter une présentation"}
              </button>
              {hasPdf && (
                <button
                  type="button"
                  className="po-btn po-btn-secondary"
                  disabled={removing}
                  onClick={() => void removePresentation()}
                  title="Retirer la présentation"
                  style={{ color: "var(--po-danger)" }}
                >
                  {removing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {hasPdf && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--po-white)",
            border: "1px solid var(--po-border)",
            fontSize: 12.5,
          }}
        >
          <FileText className="h-4 w-4" style={{ color: "var(--po-accent)", flexShrink: 0 }} />
          <span
            style={{
              fontWeight: 600,
              color: "var(--po-ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
            title={campaign.presentationFileName || undefined}
          >
            {campaign.presentationFileName || "presentation.pdf"}
          </span>
          {campaign.presentationUploadedAt && (
            <span style={{ color: "var(--po-muted)", marginLeft: "auto", flexShrink: 0 }}>
              {new Date(campaign.presentationUploadedAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      )}

      {hasPdf && (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 12,
            border: attachInEmails
              ? "1px solid color-mix(in oklab, var(--po-success) 40%, white)"
              : "1px solid var(--po-border)",
            background: attachInEmails
              ? "color-mix(in oklab, var(--po-success) 8%, white)"
              : "#FAFAFA",
            cursor: canEdit && !togglingAttach ? "pointer" : "default",
            opacity: togglingAttach ? 0.7 : 1,
          }}
        >
          <input
            type="checkbox"
            disabled={!canEdit || togglingAttach}
            checked={attachInEmails}
            onChange={(e) => void setAttachInEmails(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: "block",
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--po-ink)",
              }}
            >
              Joindre ce PDF aux mails de prospection
            </span>
            <span
              style={{
                display: "block",
                marginTop: 2,
                fontSize: 12.5,
                color: "var(--po-muted)",
                lineHeight: 1.4,
              }}
            >
              {attachInEmails
                ? "Quand Casting envoie (Leyna), le PDF part en pièce jointe avec chaque mail."
                : "Le PDF reste sur le projet (aperçu) mais n’est pas joint aux envois."}
            </span>
          </span>
          {togglingAttach && (
            <Loader2
              className="h-4 w-4 animate-spin"
              style={{ marginLeft: "auto", flexShrink: 0, color: "var(--po-muted)" }}
            />
          )}
        </label>
      )}
    </div>
  );
}

function PresentationPreviewModal({
  url,
  fileName,
  onClose,
}: {
  url: string;
  fileName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu — ${fileName}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(19, 19, 22, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="po-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(960px, 100%)",
          height: "min(88vh, 900px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: 0,
          boxShadow: "0 24px 64px rgba(9, 9, 11, 0.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid var(--po-border)",
            background: "var(--po-surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <FileText className="h-4 w-4" style={{ color: "var(--po-accent)", flexShrink: 0 }} />
            <span
              style={{
                fontWeight: 700,
                fontSize: 13.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {fileName}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="po-btn po-btn-secondary"
              style={{ padding: "6px 10px" }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Nouvel onglet
            </a>
            <button
              type="button"
              className="po-btn po-btn-icon"
              onClick={onClose}
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <iframe
          title={fileName}
          src={`${url}#toolbar=1&navpanes=0`}
          style={{
            flex: 1,
            width: "100%",
            border: "none",
            background: "#525659",
          }}
        />
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
