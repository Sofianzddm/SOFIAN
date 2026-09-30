"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Mail, BellOff, BellRing, CheckCircle2, Pencil, Check, X, Clock, Feather, Sparkles, Send, Inbox, MessageCircle, Handshake, Trophy, XCircle, ShieldAlert, Layers, UserPlus, Database, ScanSearch, ExternalLink, Trash2 } from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";
import { businessDaysAfter, hasBusinessDaysElapsed } from "@/lib/business-days";
import { brandsLookSame } from "@/lib/brand-match";

type Role = "STRATEGY_PLANNER" | "CASTING_MANAGER" | "HEAD_OF_SALES" | "HEAD_OF" | "ADMIN";
type Stage =
  | "STRATEGY_DEFINED"
  | "TO_DRAFT"
  | "DRAFTED_FOR_VALIDATION"
  | "TO_SEND"
  | "SENT"
  | "RESPONSE_RECEIVED"
  | "IN_NEGOTIATION"
  | "WON"
  | "LOST";

type Mission = {
  id: string;
  campaignId: string | null;
  campaignTitle: string | null;
  talentId?: string | null;
  talentName?: string | null;
  creatorName: string;
  targetBrand: string;
  /** Nom canonique de la fiche marque liée (ex. « Miu Miu »), si `marqueId` résolu. */
  marqueNom?: string | null;
  marqueId?: string | null;
  strategyReason: string;
  recommendedAngle: string | null;
  objective: string | null;
  dos: string | null;
  donts: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "READY_FOR_CASTING" | "EMAIL_DRAFTED" | "APPROVED_BY_SALES" | "SENT" | "RELANCED" | "CANCELLED";
  stage: Stage;
  draftEmailSubject?: string | null;
  draftEmailBody?: string | null;
  draftLanguage?: "fr" | "en" | null;
  clientLanguage?: "FR" | "EN" | null;
  clientContacts?: Array<{ firstname?: string; lastname?: string; email?: string; role?: string }> | null;
  scheduledSendAt?: string | null;
  sentAt?: string | null;
  sendError?: string | null;
  relanceSentAt?: string | null;
  relanceError?: string | null;
  relance2SentAt?: string | null;
  relance2Error?: string | null;
  relanceCancelledAt?: string | null;
  replied?: boolean;
  openCount?: number;
  openedAt?: string | null;
  clickCount?: number;
  clickedAt?: string | null;
  awaitingContactsCompletion?: boolean;
  contactsCompletionRequestedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type SortOrder = "oldest" | "newest";

type ScheduledSend = {
  missionId: string;
  brandLabel: string;
  scheduledAt: number;
};

type ContactDraft = { firstname: string; lastname: string; email: string; role: string };

type SearchedContact = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  companyName: string;
  source: "app" | "hubspot";
};

type ContactSearchState = {
  loading: boolean;
  results: SearchedContact[];
  searched: boolean;
};

type BrandMatch = {
  id: string;
  nom: string;
  ville: string;
  contactCount: number;
};

type BrandSearchState = {
  query: string;
  loading: boolean;
  results: BrandMatch[];
  searched: boolean;
};

type DraftedSubTab = "cards" | "contacts" | "enrich";
type StageTab = Stage | "BLOCKED" | "AWAITING_ENRICH";

type ReadyContact = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  principal: boolean;
  blockedByCooldown: boolean;
};

type ReadyItem = {
  mission: Mission;
  availableContacts: ReadyContact[];
  alreadyAttachedCount: number;
};

type EnrichItem = {
  mission: Mission;
  reason: "no_marque" | "no_contacts";
  crmContactCount: number;
};

const REMINDER_BUSINESS_DAYS = 3;
/** Doit rester aligné sur CASTING_RELANCE2_BUSINESS_DAYS (src/lib/casting-auto-send.ts). */
const RELANCE2_BUSINESS_DAYS = 10;
/** Aligné sur INDIV_BRAND_WAVE_DAYS : 1 vague / marque / 20 j (tous talents). */
const BRAND_BLOCK_DAYS = 20;

/** Affiche le nom fiche marque quand lié, sinon le libellé saisi (ex. MiuMiu → Miu Miu). */
function brandDisplayName(m: Pick<Mission, "targetBrand" | "marqueNom">): string {
  const canonical = String(m.marqueNom || "").trim();
  if (canonical) return canonical;
  return String(m.targetBrand || "").trim();
}

function daysLeftUntil(lastSentAt: Date, now: Date = new Date()): number {
  const unlockAt = lastSentAt.getTime() + BRAND_BLOCK_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((unlockAt - now.getTime()) / (24 * 60 * 60 * 1000)));
}

type BlockedBrandCluster = {
  key: string;
  brandLabel: string;
  variants: string[];
  marqueIds: string[];
  lastSentAt: Date;
  daysLeft: number;
  /** Talents déjà envoyés (cause du blocage) + autres talents en attente sur la même marque. */
  talents: Array<{
    missionId: string;
    talentId: string | null;
    name: string;
    stage: Stage;
    sentAt: string | null;
  }>;
};

function buildBlockedBrandClusters(
  missions: Mission[],
  now: Date = new Date()
): BlockedBrandCluster[] {
  const since = now.getTime() - BRAND_BLOCK_DAYS * 24 * 60 * 60 * 1000;

  const sent = missions.filter((m) => {
    if (!m.sentAt) return false;
    const t = new Date(m.sentAt).getTime();
    return !Number.isNaN(t) && t >= since;
  });
  if (sent.length === 0) return [];

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p !== x) parent.set(x, find(p));
    return parent.get(x)!;
  };
  const unite = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const m of sent) find(m.id);

  for (let i = 0; i < sent.length; i++) {
    for (let j = i + 1; j < sent.length; j++) {
      const a = sent[i];
      const b = sent[j];
      if (a.marqueId && b.marqueId && a.marqueId === b.marqueId) {
        unite(a.id, b.id);
        continue;
      }
      if (
        brandsLookSame(brandDisplayName(a), brandDisplayName(b)) ||
        brandsLookSame(a.targetBrand, b.targetBrand)
      ) {
        unite(a.id, b.id);
      }
    }
  }

  type Acc = {
    label: string;
    variants: Set<string>;
    marqueIds: Set<string>;
    lastSentAt: Date;
    talents: BlockedBrandCluster["talents"];
    missionIds: Set<string>;
  };
  const byRoot = new Map<string, Acc>();

  for (const m of sent) {
    const root = find(m.id);
    const label = brandDisplayName(m);
    const sentAt = new Date(m.sentAt!);
    let acc = byRoot.get(root);
    if (!acc) {
      acc = {
        label,
        variants: new Set([label, m.targetBrand].filter(Boolean)),
        marqueIds: new Set(m.marqueId ? [m.marqueId] : []),
        lastSentAt: sentAt,
        talents: [],
        missionIds: new Set(),
      };
      byRoot.set(root, acc);
    } else {
      acc.variants.add(label);
      if (m.targetBrand) acc.variants.add(m.targetBrand);
      if (m.marqueId) acc.marqueIds.add(m.marqueId);
      if (sentAt > acc.lastSentAt) {
        acc.lastSentAt = sentAt;
        acc.label = label;
      }
    }
    if (!acc.missionIds.has(m.id)) {
      acc.missionIds.add(m.id);
      acc.talents.push({
        missionId: m.id,
        talentId: m.talentId || null,
        name: (m.talentName || m.creatorName || "Talent").trim(),
        stage: m.stage,
        sentAt: m.sentAt || null,
      });
    }
  }

  // Autres cartes ouvertes sur la même marque → aussi bloquées / listées
  // (y compris celles avec un vieux sentAt hors fenêtre, ex. renvoyées en TO_SEND)
  const roots = [...byRoot.entries()];
  const anchorIds = new Set(sent.map((m) => m.id));
  for (const m of missions) {
    if (anchorIds.has(m.id)) continue;
    if (m.stage === "SENT" || m.stage === "RESPONSE_RECEIVED") continue;
    const label = brandDisplayName(m);
    const hit = roots.find(([, acc]) => {
      if (m.marqueId && acc.marqueIds.has(m.marqueId)) return true;
      return (
        brandsLookSame(label, acc.label) ||
        [...acc.variants].some(
          (v) => brandsLookSame(label, v) || brandsLookSame(m.targetBrand, v)
        )
      );
    });
    if (!hit) continue;
    const [, acc] = hit;
    if (acc.missionIds.has(m.id)) continue;
    acc.missionIds.add(m.id);
    if (m.marqueId) acc.marqueIds.add(m.marqueId);
    acc.talents.push({
      missionId: m.id,
      talentId: m.talentId || null,
      name: (m.talentName || m.creatorName || "Talent").trim(),
      stage: m.stage,
      // Pas un envoi de la vague courante → affiché comme en attente
      sentAt: null,
    });
  }

  const clusters: BlockedBrandCluster[] = roots.map(([root, acc]) => {
    acc.talents.sort((a, b) => {
      const aSent = a.sentAt ? 0 : 1;
      const bSent = b.sentAt ? 0 : 1;
      if (aSent !== bSent) return aSent - bSent;
      return a.name.localeCompare(b.name, "fr");
    });
    return {
      key: root,
      brandLabel: acc.label,
      variants: [...acc.variants],
      marqueIds: [...acc.marqueIds],
      lastSentAt: acc.lastSentAt,
      daysLeft: daysLeftUntil(acc.lastSentAt, now),
      talents: acc.talents,
    };
  });

  return clusters.sort((a, b) => a.daysLeft - b.daysLeft);
}


/**
 * Date du dernier mail parti vers le client (mail initial ou relance auto).
 * Le rappel « relance à faire » se base dessus et NON sur `updatedAt` : ce
 * dernier est rafraîchi à chaque ouverture du mail par le client (pixel de
 * tracking), ce qui masquait le rappel sur les cartes souvent ouvertes.
 */
function lastMailSentAt(m: Mission): Date | null {
  // Fallback updatedAt pour les cartes passées en « Envoyé » sans envoi via
  // la plateforme (ancien comportement conservé).
  const raw = m.relance2SentAt || m.relanceSentAt || m.sentAt || m.updatedAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Rappel « relance client à faire » : 3 jours ouvrés après le dernier mail parti. */
function manualReminderDue(m: Mission, now: Date = new Date()): boolean {
  if (m.stage !== "SENT") return false;
  const lastMail = lastMailSentAt(m);
  return lastMail !== null && hasBusinessDaysElapsed(lastMail, REMINDER_BUSINESS_DAYS, now);
}

/**
 * Date prévue de la relance 2 auto (J+10 ouvrés après la relance J+3), ou null
 * si non applicable (relance 1 pas encore partie, relance 2 déjà envoyée,
 * relances stoppées manuellement, ou carte sortie du périmètre du cron).
 */
function relance2PlannedAt(m: Mission): Date | null {
  if (!m.relanceSentAt || m.relance2SentAt || m.relanceCancelledAt) return null;
  if (m.stage !== "SENT" && m.stage !== "RESPONSE_RECEIVED") return null;
  const relance1 = new Date(m.relanceSentAt);
  if (Number.isNaN(relance1.getTime())) return null;
  return businessDaysAfter(relance1, RELANCE2_BUSINESS_DAYS);
}

type TalentOption = { id: string; name: string };
const ALL_TALENTS = "__ALL_TALENTS__";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const STAGE_LABEL: Record<Stage, string> = {
  STRATEGY_DEFINED: "Stratégie définie",
  TO_DRAFT: "À rédiger",
  DRAFTED_FOR_VALIDATION: "Rédigé (validation)",
  TO_SEND: "À envoyer",
  SENT: "Envoyé",
  RESPONSE_RECEIVED: "Réponse reçue",
  IN_NEGOTIATION: "En négo",
  WON: "Gagné",
  LOST: "Perdu",
};

function allowedColumns(role: Role | null): Stage[] {
  if (role === "CASTING_MANAGER") return ["TO_DRAFT", "DRAFTED_FOR_VALIDATION"];
  if (role === "HEAD_OF_SALES") return ["DRAFTED_FOR_VALIDATION", "TO_SEND"];
  if (role === "STRATEGY_PLANNER") {
    return [
      "STRATEGY_DEFINED",
      "TO_DRAFT",
      "DRAFTED_FOR_VALIDATION",
      "TO_SEND",
      "SENT",
      "RESPONSE_RECEIVED",
      "IN_NEGOTIATION",
      "WON",
      "LOST",
    ];
  }
  return [
    "STRATEGY_DEFINED",
    "TO_DRAFT",
    "DRAFTED_FOR_VALIDATION",
    "TO_SEND",
    "SENT",
    "RESPONSE_RECEIVED",
    "IN_NEGOTIATION",
    "WON",
    "LOST",
  ];
}

function stageLabelForRole(stage: Stage, role: Role | null): string {
  if (role === "CASTING_MANAGER" && stage === "DRAFTED_FOR_VALIDATION") {
    return "Prêt";
  }
  return STAGE_LABEL[stage];
}

function columnAccentColor(stage: Stage, casting = false): string {
  if (casting) {
    if (stage === "TO_DRAFT") return OLD_ROSE;
    if (stage === "DRAFTED_FOR_VALIDATION") return TEA_GREEN;
  }
  if (stage === "LOST") return "#94a3b8";
  if (stage === "WON") return "#334155";
  if (stage === "SENT" || stage === "RESPONSE_RECEIVED") return "#475569";
  return "#94a3b8";
}

const STAGE_ICON: Record<Stage, typeof Feather> = {
  STRATEGY_DEFINED: Layers,
  TO_DRAFT: Feather,
  DRAFTED_FOR_VALIDATION: Sparkles,
  TO_SEND: Send,
  SENT: Inbox,
  RESPONSE_RECEIVED: MessageCircle,
  IN_NEGOTIATION: Handshake,
  WON: Trophy,
  LOST: XCircle,
};

const STAGE_HINT: Record<Stage, string> = {
  STRATEGY_DEFINED: "Brief validé",
  TO_DRAFT: "Rédaction",
  DRAFTED_FOR_VALIDATION: "Relecture",
  TO_SEND: "Planification",
  SENT: "En attente de retour",
  RESPONSE_RECEIVED: "Réponse reçue",
  IN_NEGOTIATION: "Négociation",
  WON: "Clos gagné",
  LOST: "Clos perdu",
};

export function ProspectingPipelineClient() {
  const [role, setRole] = useState<Role | null>(null);
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [selectedTalentId, setSelectedTalentId] = useState(ALL_TALENTS);
  const [sortOrder, setSortOrder] = useState<SortOrder>("oldest");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // Rappels acquittés via le bouton « Relancer » pendant la session : le
  // badge est masqué immédiatement (il réapparaît au rechargement tant
  // qu'aucun nouveau mail n'est parti).
  const [ackedReminderIds, setAckedReminderIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContact, setComposerContact] = useState<any>(null);
  const [contactFormByMission, setContactFormByMission] = useState<
    Record<string, { open: boolean; contacts: ContactDraft[] }>
  >({});
  const [contactSearchByMission, setContactSearchByMission] = useState<
    Record<string, ContactSearchState>
  >({});
  const [brandSearchByMission, setBrandSearchByMission] = useState<
    Record<string, BrandSearchState>
  >({});
  const [scheduledSends, setScheduledSends] = useState<ScheduledSend[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const sendingMissionIdsRef = useRef<Set<string>>(new Set());
  // Édition inline du nom de la marque (correction de faute de frappe)
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingBrandValue, setEditingBrandValue] = useState("");

  const [activeStageTab, setActiveStageTab] = useState<StageTab>("TO_DRAFT");
  const [readyItems, setReadyItems] = useState<ReadyItem[]>([]);
  const [enrichItems, setEnrichItems] = useState<EnrichItem[]>([]);
  const [readyLoading, setReadyLoading] = useState(false);
  const [readyCooldownDays, setReadyCooldownDays] = useState(20);
  const [readySubTab, setReadySubTab] = useState<DraftedSubTab>("cards");
  /** Contacts cochés par mission (emails). */
  const [selectedEmailsByMission, setSelectedEmailsByMission] = useState<
    Record<string, string[]>
  >({});
  /** Missions cochées pour planif en masse. */
  const [bulkSelectedMissionIds, setBulkSelectedMissionIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkScheduling, setBulkScheduling] = useState(false);

  const visibleStages = useMemo(() => allowedColumns(role), [role]);
  const isCastingManager = role === "CASTING_MANAGER";
  // Rôles autorisés à corriger le nom de la marque sur une carte.
  const canEditBrand =
    role === "ADMIN" || role === "HEAD_OF" || role === "STRATEGY_PLANNER";
  const canUseReadyTab =
    role === "ADMIN" ||
    role === "HEAD_OF" ||
    role === "HEAD_OF_SALES" ||
    role === "CASTING_MANAGER";

  useEffect(() => {
    if (activeStageTab === "BLOCKED" || activeStageTab === "AWAITING_ENRICH") return;
    if (!visibleStages.includes(activeStageTab)) {
      setActiveStageTab(visibleStages[0] || "TO_DRAFT");
    }
  }, [visibleStages, activeStageTab]);

  async function loadRole() {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.role === "string") {
      setRole(data.role as Role);
    }
  }

  async function loadTalents() {
    const res = await fetch("/api/talents?presskit=true", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur chargement talents");
    const rows = Array.isArray(data.talents) ? data.talents : [];
    const mapped = rows.map((t: any) => ({
      id: String(t.id),
      name: String(t.name || `${t.prenom || ""} ${t.nom || ""}`.trim() || "Talent"),
    }));
    setTalents(mapped);
  }

  async function loadMissions() {
    const isAllTalents = selectedTalentId === ALL_TALENTS || !selectedTalentId;
    const mine = role === "STRATEGY_PLANNER" ? "&mine=1" : "";
    const talentFilter = isAllTalents ? "" : `talentId=${encodeURIComponent(selectedTalentId)}&`;
    const res = await fetch(
      `/api/strategy/contact-missions?${talentFilter}${mine}`,
      { credentials: "include" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur missions");
    setMissions(Array.isArray(data.missions) ? (data.missions as Mission[]) : []);
  }

  function defaultSelectedEmails(contacts: ReadyContact[]): string[] {
    const principals = contacts.filter((c) => c.principal).map((c) => c.email);
    if (principals.length > 0) return principals;
    return contacts.map((c) => c.email);
  }

  async function loadReadyToSend() {
    if (!canUseReadyTab) {
      setReadyItems([]);
      setEnrichItems([]);
      return;
    }
    setReadyLoading(true);
    try {
      const isAllTalents = selectedTalentId === ALL_TALENTS || !selectedTalentId;
      const talentFilter = isAllTalents
        ? ""
        : `?talentId=${encodeURIComponent(selectedTalentId)}`;
      const res = await fetch(`/api/strategy/contact-missions/ready-to-send${talentFilter}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur contacts dispo");
      const withContactsRaw = Array.isArray(data.withContacts)
        ? data.withContacts
        : Array.isArray(data.items)
          ? data.items
          : [];
      const items: ReadyItem[] = withContactsRaw.map((row: ReadyItem) => ({
        mission: row.mission,
        availableContacts: Array.isArray(row.availableContacts) ? row.availableContacts : [],
        alreadyAttachedCount: Number(row.alreadyAttachedCount || 0),
      }));
      const enrichRaw = Array.isArray(data.needsEnrichment) ? data.needsEnrichment : [];
      const enrich: EnrichItem[] = enrichRaw.map((row: EnrichItem) => ({
        mission: row.mission,
        reason: row.reason === "no_marque" ? "no_marque" : "no_contacts",
        crmContactCount: Number(row.crmContactCount || 0),
      }));
      setReadyItems(items);
      setEnrichItems(enrich);
      if (typeof data.cooldownDays === "number") setReadyCooldownDays(data.cooldownDays);

      setSelectedEmailsByMission((prev) => {
        const next: Record<string, string[]> = {};
        for (const item of items) {
          const existing = prev[item.mission.id];
          const validEmails = new Set(item.availableContacts.map((c) => c.email));
          if (existing && existing.length > 0) {
            const kept = existing.filter((e) => validEmails.has(e));
            next[item.mission.id] =
              kept.length > 0 ? kept : defaultSelectedEmails(item.availableContacts);
          } else {
            next[item.mission.id] = defaultSelectedEmails(item.availableContacts);
          }
        }
        return next;
      });
      setBulkSelectedMissionIds((prev) => {
        const validIds = new Set(items.map((i) => i.mission.id));
        return new Set(Array.from(prev).filter((id) => validIds.has(id)));
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setReadyItems([]);
      setEnrichItems([]);
    } finally {
      setReadyLoading(false);
    }
  }

  async function queueForEnrichissement(missionId: string) {
    setUpdatingId(missionId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/strategy/contact-missions/${missionId}/request-enrichissement`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de mettre en file.");
      setMissions((prev) =>
        prev.map((m) =>
          m.id === missionId
            ? {
                ...m,
                awaitingContactsCompletion: true,
                contactsCompletionRequestedAt: new Date().toISOString(),
              }
            : m
        )
      );
      setActiveStageTab("AWAITING_ENRICH");
      setSuccess(
        data.message ||
          "Marque basculée dans « Enrichissement » — complète les contacts CRM."
      );
      void loadReadyToSend();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function resolveEnrichissement(missionId: string) {
    setUpdatingId(missionId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/strategy/contact-missions/${missionId}/resolve-enrichissement`,
        { method: "POST", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de valider.");
      setMissions((prev) =>
        prev.map((m) =>
          m.id === missionId ? { ...m, awaitingContactsCompletion: false } : m
        )
      );
      setSuccess(data.message || "Contacts prêts — carte redevenue active.");
      void loadReadyToSend();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      await loadRole();
      await loadTalents();
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
  }, [selectedTalentId, role]);

  useEffect(() => {
    if (!canUseReadyTab) return;
    void loadReadyToSend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTalentId, role, canUseReadyTab]);

  useEffect(() => {
    if (canUseReadyTab && activeStageTab === "DRAFTED_FOR_VALIDATION") {
      void loadReadyToSend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStageTab, readySubTab, canUseReadyTab]);

  useEffect(() => {
    // Inclut aussi les renvois post-envoi (stage SENT + sentAt déjà set) :
    // schedule-send ne redescend pas en TO_SEND, il pose seulement scheduledSendAt.
    const hydrated: ScheduledSend[] = missions
      .filter((m) => Boolean(m.scheduledSendAt))
      .map((m) => ({
        missionId: m.id,
        brandLabel: `${m.creatorName} → ${brandDisplayName(m)}`,
        scheduledAt: new Date(m.scheduledSendAt!).getTime(),
      }));
    setScheduledSends((prev) => {
      const byId = new Map(prev.map((s) => [s.missionId, s]));
      for (const s of hydrated) byId.set(s.missionId, s);
      for (const id of Array.from(byId.keys())) {
        const stillPlanned = missions.find((m) => m.id === id && m.scheduledSendAt);
        if (!stillPlanned) byId.delete(id);
      }
      return Array.from(byId.values());
    });
  }, [missions]);

  useEffect(() => {
    if (scheduledSends.length === 0) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [scheduledSends.length]);

  useEffect(() => {
    for (const planned of scheduledSends) {
      if (sendingMissionIdsRef.current.has(planned.missionId)) continue;
      if (planned.scheduledAt > nowTick) continue;
      sendingMissionIdsRef.current.add(planned.missionId);
      void (async () => {
        try {
          const res = await fetch(
            `/api/strategy/contact-missions/${planned.missionId}/send-now`,
            { method: "POST", credentials: "include" }
          );
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            const succ = Number(data.succeeded ?? 0);
            const fail = Number(data.failed ?? 0);
            if (succ > 0 && fail === 0) {
              setSuccess(`Mail envoyé depuis Leyna (${succ} destinataire${succ > 1 ? "s" : ""}).`);
            } else if (succ > 0) {
              setSuccess(`Envoi partiel : ${succ} ok, ${fail} échec(s).`);
            } else {
              setError(data.errors?.join(" | ") || "Aucun mail envoyé.");
            }
          } else if (res.status !== 409) {
            setError(data.error || "Envoi automatique impossible.");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur réseau pendant l'envoi auto.");
        } finally {
          sendingMissionIdsRef.current.delete(planned.missionId);
          setScheduledSends((prev) => prev.filter((s) => s.missionId !== planned.missionId));
          await loadMissions().catch(() => {});
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledSends, nowTick]);

  async function patchMission(
    missionId: string,
    payload: {
      stage?: Stage;
      status?: string;
      targetBrand?: string;
      draftEmailSubject?: string;
      draftEmailBody?: string;
      draftLanguage?: "fr" | "en";
      clientLanguage?: "FR" | "EN" | "";
      clientContacts?: Array<{ firstname?: string; lastname?: string; email?: string; role?: string }>;
    }
  ): Promise<{
    awaitingResolved?: { resolvedCount: number; sourceLabel: string; message: string } | null;
  }> {
    setUpdatingId(missionId);
    try {
      const res = await fetch("/api/strategy/contact-missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible.");
      await loadMissions();
      return {
        awaitingResolved: data.awaitingResolved || null,
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      throw e;
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteMission(m: Mission) {
    const label = `${m.creatorName} → ${brandDisplayName(m)}`;
    if (
      !window.confirm(
        `Supprimer définitivement « ${label} » du pipeline ?\n\nCette action est irréversible.`
      )
    ) {
      return;
    }
    setUpdatingId(m.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${m.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      setMissions((prev) => prev.filter((x) => x.id !== m.id));
      setSuccess(data.message || `${label} supprimée.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  function startEditBrand(m: Mission) {
    setEditingBrandId(m.id);
    setEditingBrandValue(brandDisplayName(m));
  }

  function cancelEditBrand() {
    setEditingBrandId(null);
    setEditingBrandValue("");
  }

  async function saveBrand(m: Mission) {
    const next = editingBrandValue.trim();
    if (!next) {
      setError("Le nom de la marque ne peut pas être vide.");
      return;
    }
    if (next === m.targetBrand || next === String(m.marqueNom || "").trim()) {
      cancelEditBrand();
      return;
    }
    try {
      await patchMission(m.id, { targetBrand: next });
      setSuccess(`Marque renommée en « ${next} ».`);
      cancelEditBrand();
    } catch {
      // erreur déjà affichée via patchMission
    }
  }

  async function searchClientContacts(m: Mission, brandOverride?: string) {
    const brand = String(brandOverride ?? brandDisplayName(m) ?? "").trim();
    if (brand.length < 2) {
      setError("Nom de la boîte trop court pour rechercher des contacts.");
      return;
    }
    setError(null);
    setContactSearchByMission((prev) => ({
      ...prev,
      [m.id]: {
        loading: true,
        results: prev[m.id]?.results || [],
        searched: prev[m.id]?.searched || false,
      },
    }));
    try {
      const res = await fetch(
        `/api/marques/contacts?brand=${encodeURIComponent(brand)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Recherche impossible.");
      const results: SearchedContact[] = (Array.isArray(data.contacts) ? data.contacts : [])
        .map((c: Record<string, unknown>) => ({
          id: String(c.id || ""),
          firstname: String(c.firstname || "").trim(),
          lastname: String(c.lastname || "").trim(),
          email: String(c.email || "").trim(),
          role: String(c.role || "").trim(),
          companyName: String(c.companyName || "").trim(),
          source: "app" as const,
        }));
      setContactSearchByMission((prev) => ({
        ...prev,
        [m.id]: { loading: false, results, searched: true },
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setContactSearchByMission((prev) => ({
        ...prev,
        [m.id]: { loading: false, results: [], searched: true },
      }));
    }
  }

  // Recherche par préfixe dans la base marque interne : « star » → toutes les
  // marques qui commencent par (Starbucks…), pour retrouver la bonne fiche sans
  // connaître l'orthographe exacte.
  async function searchBrands(missionId: string) {
    const query = String(brandSearchByMission[missionId]?.query || "").trim();
    if (query.length < 2) {
      setError("Saisis au moins 2 caractères pour chercher une marque.");
      return;
    }
    setError(null);
    setBrandSearchByMission((prev) => ({
      ...prev,
      [missionId]: {
        query,
        loading: true,
        results: prev[missionId]?.results || [],
        searched: prev[missionId]?.searched || false,
      },
    }));
    try {
      const res = await fetch(
        `/api/marques/search?q=${encodeURIComponent(query)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Recherche impossible.");
      const results: BrandMatch[] = (Array.isArray(data.marques) ? data.marques : []).map(
        (b: Record<string, unknown>) => ({
          id: String(b.id || ""),
          nom: String(b.nom || "").trim(),
          ville: String(b.ville || "").trim(),
          contactCount: Number(b.contactCount || 0),
        })
      );
      setBrandSearchByMission((prev) => ({
        ...prev,
        [missionId]: { query, loading: false, results, searched: true },
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setBrandSearchByMission((prev) => ({
        ...prev,
        [missionId]: { query, loading: false, results: [], searched: true },
      }));
    }
  }

  function addSearchedContactToForm(missionId: string, sc: SearchedContact) {
    const email = String(sc.email || "").trim().toLowerCase();
    setContactFormByMission((prev) => {
      const existing = prev[missionId]?.contacts || [];
      // Dédoublonnage par email seulement si un email est présent.
      if (email && existing.some((c) => c.email.trim().toLowerCase() === email)) {
        return prev;
      }
      const draft: ContactDraft = {
        firstname: sc.firstname || "",
        lastname: sc.lastname || "",
        email: sc.email || "",
        role: sc.role || "",
      };
      const firstEmptyIndex = existing.findIndex(
        (c) => !c.firstname.trim() && !c.email.trim()
      );
      const nextContacts =
        firstEmptyIndex >= 0
          ? existing.map((c, i) => (i === firstEmptyIndex ? draft : c))
          : [...existing, draft];
      return { ...prev, [missionId]: { open: true, contacts: nextContacts } };
    });
  }

  async function addClientContact(m: Mission) {
    const form = contactFormByMission[m.id];
    const contactsDraft = Array.isArray(form?.contacts) ? form.contacts : [];
    const cleaned = contactsDraft
      .map((c) => ({
        firstname: String(c.firstname || "").trim(),
        lastname: String(c.lastname || "").trim(),
        email: String(c.email || "").trim().toLowerCase(),
        role: String(c.role || "").trim(),
      }))
      .filter((c) => c.firstname && c.email);

    if (cleaned.length === 0) {
      setError("Ajoute au moins un contact avec prénom et email.");
      return;
    }
    setUpdatingId(m.id);
    setError(null);
    setSuccess(null);
    try {
      const currentContacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
      const existingEmails = new Set(
        currentContacts
          .map((c) => String(c?.email || "").trim().toLowerCase())
          .filter(Boolean)
      );
      // Pour décider du message de succès, on calcule combien de contacts
      // sont vraiment nouveaux. Sur une mission déjà envoyée, seuls les
      // nouveaux contacts recevront effectivement le mail (le backend skip
      // ceux déjà présents dans `sentMessageIds`).
      const newlyAdded = cleaned.filter((c) => !existingEmails.has(c.email));
      const isAlreadySent = Boolean(m.sentAt);

      // Même système que /outreach : la langue d'envoi est captée automatiquement
      // depuis la fiche client (langue de chaque contact). Le mail est traduit
      // au besoin au moment de l'envoi.
      const translateNote = " 🌐 Chaque contact reçoit le mail dans sa langue (fiche client), traduit auto si besoin.";

      const byEmail = new Map<string, { firstname?: string; lastname?: string; email?: string; role?: string }>();
      for (const c of currentContacts) {
        const email = String(c?.email || "").trim().toLowerCase();
        if (email) byEmail.set(email, c);
      }
      for (const c of cleaned) {
        byEmail.set(c.email, c);
      }
      const nextContacts = Array.from(byEmail.values());
      const patchResult = await patchMission(m.id, {
        clientContacts: nextContacts,
        clientLanguage: (m.clientLanguage || "FR") as "FR" | "EN",
      });
      const unlockNote = patchResult.awaitingResolved?.message
        ? ` ${patchResult.awaitingResolved.message}`
        : "";
      setContactFormByMission((prev) => ({
        ...prev,
        [m.id]: { open: false, contacts: [{ firstname: "", lastname: "", email: "", role: "" }] },
      }));
      await loadMissions();

      // Si aucun email réellement nouveau et que la mission est déjà envoyée,
      // pas la peine d'appeler schedule-send (le backend renverra une erreur
      // « tous déjà contactés »). On s'arrête sur un message d'info.
      if (isAlreadySent && newlyAdded.length === 0) {
        setSuccess(
          `${cleaned.length} contact(s) enregistré(s). Aucun envoi à faire : ces emails ont déjà été contactés sur cette carte.${unlockNote}`
        );
        return;
      }

      // Déclenche immédiatement l'envoi auto depuis la boîte de Leyna :
      // 1 mail par contact, dans 30s, avec possibilité d'annuler. Sur une
      // mission déjà envoyée, le backend n'enverra qu'aux NOUVEAUX contacts
      // (les anciens présents dans sentMessageIds sont automatiquement skippés).
      try {
        const sendRes = await fetch(
          `/api/strategy/contact-missions/${m.id}/schedule-send`,
          { method: "POST", credentials: "include" }
        );
        const sendData = await sendRes.json().catch(() => ({}));
        // Cas "deja contacte recemment" : on propose d'envoyer quand meme.
        if (!sendRes.ok && sendData?.canForce) {
          const reason = askUrgentForceReason(
            `${m.creatorName} → ${brandDisplayName(m)}`,
            sendData.error
          );
          if (reason) {
            await scheduleSend(m, true, reason);
            return;
          }
          setSuccess(
            `${cleaned.length} contact(s) enregistré(s). Envoi non effectué (contact déjà contacté récemment).`
          );
          return;
        }
        if (sendRes.ok) {
          const scheduledAt = sendData.scheduledSendAt
            ? new Date(sendData.scheduledSendAt).getTime()
            : Date.now() + 30000;
          const recipientsCount =
            typeof sendData.reachableContacts === "number"
              ? sendData.reachableContacts
              : isAlreadySent
              ? newlyAdded.length
              : cleaned.length;
          setScheduledSends((prev) => [
            ...prev.filter((s) => s.missionId !== m.id),
            {
              missionId: m.id,
              brandLabel: `${m.creatorName} → ${brandDisplayName(m)}`,
              scheduledAt,
            },
          ]);
          if (isAlreadySent) {
            setSuccess(
              `${cleaned.length} contact(s) enregistré(s). Envoi dans 30s uniquement au${recipientsCount > 1 ? "x" : ""} ${recipientsCount} nouveau${recipientsCount > 1 ? "x" : ""} contact${recipientsCount > 1 ? "s" : ""} (les ${existingEmails.size} déjà contacté${existingEmails.size > 1 ? "s" : ""} sont ignoré${existingEmails.size > 1 ? "s" : ""}).${translateNote}${unlockNote}`
            );
          } else {
            setSuccess(
              `${cleaned.length} contact(s) enregistré(s). Envoi auto dans 30s depuis leyna@glowupagence.fr.${translateNote}${unlockNote}`
            );
          }
          await loadMissions();
        } else {
          setSuccess(
            `${cleaned.length} contact(s) enregistré(s). Envoi auto en attente : ${
              sendData.error || "le brouillon n'est pas encore prêt."
            }${unlockNote}`
          );
        }
      } catch {
        setSuccess(
          `${cleaned.length} contact(s) enregistré(s) (envoi auto en attente, brouillon non prêt).${unlockNote}`
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function scheduleSend(m: Mission, force = false, forceReason?: string) {
    setUpdatingId(m.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${m.id}/schedule-send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force,
          ...(force && forceReason ? { forceReason } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Projet urgent : confirmation + motif obligatoire (bypass cooldown / plafond).
        if (data?.canForce && !force) {
          const confirmed = window.confirm(
            `${m.creatorName} → ${brandDisplayName(m)}\n\n${
              data.error || "Ce contact a déjà été contacté récemment."
            }\n\nProjet urgent — envoyer quand même ? (un motif sera demandé)`
          );
          if (!confirmed) return;
          const reason = window.prompt(
            "Motif du projet urgent (obligatoire, min. 5 caractères) :",
            ""
          );
          if (!reason || reason.trim().length < 5) {
            setError("Envoi annulé : motif urgent trop court ou vide.");
            return;
          }
          setUpdatingId(null);
          await scheduleSend(m, true, reason.trim());
          return;
        }
        throw new Error(data.error || "Planification impossible.");
      }
      const scheduledAt = data.scheduledSendAt
        ? new Date(data.scheduledSendAt).getTime()
        : Date.now() + 30000;
      setScheduledSends((prev) => [
        ...prev.filter((s) => s.missionId !== m.id),
        {
          missionId: m.id,
          brandLabel: `${m.creatorName} → ${brandDisplayName(m)}`,
          scheduledAt,
        },
      ]);
      setSuccess(`Envoi programmé dans 30s vers ${brandDisplayName(m)} (boîte Leyna).`);
      await loadMissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  /**
   * Attache les contacts app sélectionnés à la mission puis planifie l'envoi
   * (même flow que « Ajouter contact client » sur la carte).
   * Retourne true si la planification a réussi.
   */
  async function attachAndScheduleReadyItem(
    item: ReadyItem,
    options: { force?: boolean; silent?: boolean; forceReason?: string } = {}
  ): Promise<{ ok: boolean; canForce?: boolean; error?: string }> {
    const emails = selectedEmailsByMission[item.mission.id] || [];
    const contacts = item.availableContacts.filter((c) => emails.includes(c.email));
    if (contacts.length === 0) {
      return { ok: false, error: "Sélectionne au moins un contact." };
    }

    const m = item.mission;
    const currentContacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
    const byEmail = new Map<
      string,
      { firstname?: string; lastname?: string; email?: string; role?: string }
    >();
    for (const c of currentContacts) {
      const email = String(c?.email || "")
        .trim()
        .toLowerCase();
      if (email) byEmail.set(email, c);
    }
    for (const c of contacts) {
      byEmail.set(c.email, {
        firstname: c.firstname,
        lastname: c.lastname,
        email: c.email,
        role: c.role,
      });
    }
    const nextContacts = Array.from(byEmail.values());

    const patchRes = await fetch("/api/strategy/contact-missions", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missionId: m.id,
        clientContacts: nextContacts,
        clientLanguage: (m.clientLanguage || "FR") as "FR" | "EN",
      }),
    });
    const patchData = await patchRes.json().catch(() => ({}));
    if (!patchRes.ok) {
      return { ok: false, error: patchData.error || "Enregistrement contact impossible." };
    }

    const sendRes = await fetch(`/api/strategy/contact-missions/${m.id}/schedule-send`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        force: options.force === true,
        ...(options.force && options.forceReason
          ? { forceReason: options.forceReason }
          : {}),
      }),
    });
    const sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      if (sendData?.canForce && !options.force) {
        return {
          ok: false,
          canForce: true,
          error: sendData.error || "Contact déjà contacté récemment.",
        };
      }
      return { ok: false, error: sendData.error || "Planification impossible." };
    }

    const scheduledAt = sendData.scheduledSendAt
      ? new Date(sendData.scheduledSendAt).getTime()
      : Date.now() + 30000;
    setScheduledSends((prev) => [
      ...prev.filter((s) => s.missionId !== m.id),
      {
        missionId: m.id,
        brandLabel: `${m.creatorName} → ${brandDisplayName(m)}`,
        scheduledAt,
      },
    ]);
    if (!options.silent) {
      const n =
        typeof sendData.reachableContacts === "number"
          ? sendData.reachableContacts
          : contacts.length;
      setSuccess(
        `${n} contact(s) — envoi programmé dans 30s vers ${brandDisplayName(m)} (boîte Leyna).`
      );
    }
    return { ok: true };
  }

  function askUrgentForceReason(label: string, detail?: string): string | null {
    const confirmed = window.confirm(
      `${label}\n\n${
        detail || "Ce contact a déjà été contacté récemment."
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

  async function planifierReadyItem(item: ReadyItem) {
    setUpdatingId(item.mission.id);
    setError(null);
    setSuccess(null);
    try {
      let result = await attachAndScheduleReadyItem(item);
      if (!result.ok && result.canForce) {
        const reason = askUrgentForceReason(
          `${item.mission.creatorName} → ${brandDisplayName(item.mission)}`,
          result.error
        );
        if (reason) {
          result = await attachAndScheduleReadyItem(item, {
            force: true,
            forceReason: reason,
          });
        } else {
          setSuccess("Contacts enregistrés. Envoi non effectué (cooldown).");
          await Promise.all([loadMissions(), loadReadyToSend()]);
          return;
        }
      }
      if (!result.ok) {
        setError(result.error || "Planification impossible.");
        await loadReadyToSend();
        return;
      }
      await Promise.all([loadMissions(), loadReadyToSend()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function planifierBulkReady() {
    const selected = readyItems.filter((item) => bulkSelectedMissionIds.has(item.mission.id));
    if (selected.length === 0) {
      setError("Sélectionne au moins une mission.");
      return;
    }
    setBulkScheduling(true);
    setError(null);
    setSuccess(null);
    let okCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    try {
      for (const item of selected) {
        setUpdatingId(item.mission.id);
        let result = await attachAndScheduleReadyItem(item, { silent: true });
        if (!result.ok && result.canForce) {
          const reason = askUrgentForceReason(
            `${item.mission.creatorName} → ${brandDisplayName(item.mission)}`,
            result.error
          );
          if (reason) {
            result = await attachAndScheduleReadyItem(item, {
              force: true,
              silent: true,
              forceReason: reason,
            });
          } else {
            failCount += 1;
            errors.push(`${brandDisplayName(item.mission)}: skip cooldown`);
            continue;
          }
        }
        if (result.ok) {
          okCount += 1;
        } else {
          failCount += 1;
          errors.push(
            `${brandDisplayName(item.mission)}: ${result.error || "échec"}`
          );
        }
      }

      if (okCount > 0 && failCount === 0) {
        setSuccess(`${okCount} envoi(s) programmé(s) dans 30s (boîte Leyna).`);
      } else if (okCount > 0) {
        setSuccess(
          `${okCount} ok, ${failCount} échec(s).${errors.length ? ` ${errors.slice(0, 3).join(" · ")}` : ""}`
        );
      } else {
        setError(errors.slice(0, 5).join(" · ") || "Aucun envoi planifié.");
      }
      setBulkSelectedMissionIds(new Set());
      await Promise.all([loadMissions(), loadReadyToSend()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
      setBulkScheduling(false);
    }
  }

  function toggleReadyContact(missionId: string, email: string) {
    setSelectedEmailsByMission((prev) => {
      const current = prev[missionId] || [];
      const next = current.includes(email)
        ? current.filter((e) => e !== email)
        : [...current, email];
      return { ...prev, [missionId]: next };
    });
  }

  function toggleBulkMission(missionId: string) {
    setBulkSelectedMissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(missionId)) next.delete(missionId);
      else next.add(missionId);
      return next;
    });
  }

  function toggleBulkAll() {
    setBulkSelectedMissionIds((prev) => {
      if (prev.size === readyItems.length) return new Set();
      return new Set(readyItems.map((i) => i.mission.id));
    });
  }

  async function toggleRelanceCancellation(m: Mission, action: "cancel" | "resume") {
    setUpdatingId(m.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${m.id}/cancel-relance`, {
        method: action === "cancel" ? "POST" : "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Action impossible.");
      }
      setSuccess(
        action === "cancel"
          ? `Relance auto stoppée pour ${m.creatorName} → ${brandDisplayName(m)}.`
          : `Relance auto réactivée pour ${m.creatorName} → ${brandDisplayName(m)}.`
      );
      await loadMissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function cancelSend(missionId: string) {
    setUpdatingId(missionId);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${missionId}/cancel-send`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Annulation impossible.");
      setScheduledSends((prev) => prev.filter((s) => s.missionId !== missionId));
      const wasAdditional =
        data?.cancelledAdditional === true ||
        Boolean(missions.find((m) => m.id === missionId)?.sentAt);
      setSuccess(
        wasAdditional
          ? "Envoi additionnel annulé. La carte reste en « Envoyé »."
          : "Envoi annulé. La carte est revenue en « Rédigé »."
      );
      await loadMissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function openComposer(m: Mission) {
    setUpdatingId(m.id);
    try {
      // Si mission rattachée à une vague Strategy non validée → bloquer Casting.
      try {
        const gateRes = await fetch(
          `/api/projets-outreach/condensation-briefs?missionId=${encodeURIComponent(m.id)}`,
          { credentials: "include" }
        );
        const gateData = await gateRes.json().catch(() => ({}));
        if (gateRes.ok && gateData?.gate?.blocked) {
          setError(
            typeof gateData.gate.message === "string"
              ? gateData.gate.message
              : "Rédaction bloquée : vague Strategy non validée."
          );
          return;
        }
      } catch {
        // si l'API gate échoue, on laisse le backend PATCH/schedule bloquer
      }

      const localContacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
      setComposerContact({
        company: brandDisplayName(m),
        contacts: localContacts.map((c, index) => ({
          id: `${m.id}-${index}`,
          firstname: String(c?.firstname || "").trim(),
          lastname: String(c?.lastname || "").trim(),
          email: String(c?.email || "").trim(),
        })),
        initialSubject: String(m.draftEmailSubject || "").trim(),
        initialBodyHtml: String(m.draftEmailBody || "").trim(),
        missionBrief: {
          id: m.id,
          stage: m.stage,
          creatorName: m.creatorName,
          targetBrand: m.targetBrand,
          strategyReason: m.strategyReason,
          recommendedAngle: m.recommendedAngle,
          objective: m.objective,
          dos: m.dos,
          donts: m.donts,
          priority: m.priority,
          status: m.status,
          clientLanguage: m.clientLanguage || null,
          clientContacts: Array.isArray(m.clientContacts) ? m.clientContacts : [],
        },
      });
      setComposerOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  const grouped = useMemo(() => {
    const map: Record<Stage, Mission[]> = {
      STRATEGY_DEFINED: [],
      TO_DRAFT: [],
      DRAFTED_FOR_VALIDATION: [],
      TO_SEND: [],
      SENT: [],
      RESPONSE_RECEIVED: [],
      IN_NEGOTIATION: [],
      WON: [],
      LOST: [],
    };
    for (const m of missions) {
      if (m.awaitingContactsCompletion) continue;
      map[m.stage].push(m);
    }
    const timeOf = (m: Mission): number => {
      const raw = m.createdAt || m.updatedAt;
      const t = raw ? new Date(raw).getTime() : NaN;
      return Number.isNaN(t) ? 0 : t;
    };
    for (const stage of Object.keys(map) as Stage[]) {
      map[stage].sort((a, b) =>
        sortOrder === "oldest" ? timeOf(a) - timeOf(b) : timeOf(b) - timeOf(a)
      );
    }
    return map;
  }, [missions, sortOrder]);

  const awaitingEnrichMissions = useMemo(() => {
    const list = missions.filter((m) => m.awaitingContactsCompletion);
    const timeOf = (m: Mission): number => {
      const raw = m.contactsCompletionRequestedAt || m.updatedAt || m.createdAt;
      const t = raw ? new Date(raw).getTime() : NaN;
      return Number.isNaN(t) ? 0 : t;
    };
    return list.sort((a, b) => timeOf(b) - timeOf(a));
  }, [missions]);

  /** Horloge minute : déblocage auto J+20 sans rebuild chaque seconde. */
  const brandBlockClockMin = Math.floor(nowTick / 60_000);
  const blockedBrandClusters = useMemo(
    () => buildBlockedBrandClusters(missions, new Date(brandBlockClockMin * 60_000)),
    [missions, brandBlockClockMin]
  );

  const isMissionBrandBlocked = (m: Mission): boolean => {
    if (
      blockedBrandClusters.some((c) =>
        c.talents.some((t) => t.missionId === m.id)
      )
    ) {
      return true;
    }
    const label = brandDisplayName(m);
    return blockedBrandClusters.some((c) => {
      if (m.marqueId && c.marqueIds.includes(m.marqueId)) return true;
      return (
        brandsLookSame(label, c.brandLabel) ||
        c.variants.some(
          (v) => brandsLookSame(label, v) || brandsLookSame(m.targetBrand, v)
        )
      );
    });
  };

  /** Cartes hors marques déjà contactées ce mois (tous talents — affichées à part). */
  const missionsForStage = (stage: Stage): Mission[] => {
    const list = grouped[stage] || [];
    if (stage === "SENT" || stage === "RESPONSE_RECEIVED") return list;
    return list.filter((m) => !isMissionBrandBlocked(m));
  };

  const stageCounts = useMemo(() => {
    const counts: Partial<Record<Stage, number>> = {};
    for (const stage of visibleStages) {
      const list = grouped[stage] || [];
      if (stage === "SENT" || stage === "RESPONSE_RECEIVED") {
        counts[stage] = list.length;
        continue;
      }
      counts[stage] = list.filter((m) => !isMissionBrandBlocked(m)).length;
    }
    return counts;
  }, [visibleStages, grouped, blockedBrandClusters]);

  const pipelineProgress = useMemo(() => {
    const total = visibleStages.reduce(
      (acc, stage) => acc + (stageCounts[stage] || 0),
      0
    );
    const doneish =
      (stageCounts.SENT || 0) +
      (stageCounts.RESPONSE_RECEIVED || 0) +
      (stageCounts.IN_NEGOTIATION || 0) +
      (stageCounts.WON || 0);
    return { total, doneish };
  }, [visibleStages, stageCounts]);

  const sentReminderCount = useMemo(() => {
    const now = new Date();
    return grouped.SENT.filter(
      (mission) => manualReminderDue(mission, now) && !ackedReminderIds.has(mission.id)
    ).length;
  }, [grouped.SENT, ackedReminderIds]);

  const activeStageMissions =
    activeStageTab === "BLOCKED" || activeStageTab === "AWAITING_ENRICH"
      ? []
      : missionsForStage(activeStageTab);
  const StageIcon =
    activeStageTab === "BLOCKED"
      ? ShieldAlert
      : activeStageTab === "AWAITING_ENRICH"
        ? ScanSearch
        : STAGE_ICON[activeStageTab];

  return (
    <main
      className="min-h-screen space-y-5 p-4 md:p-6"
      style={
        isCastingManager
          ? {
              fontFamily: "Switzer, system-ui, sans-serif",
              background: "#F7F1E8",
            }
          : {
              background: "#f8fafc",
            }
      }
    >
      <section
        className="relative overflow-hidden rounded-2xl border bg-white p-5 md:p-6"
        style={
          isCastingManager
            ? {
                borderColor: `color-mix(in srgb, ${OLD_ROSE} 22%, transparent)`,
                boxShadow: "0 10px 30px color-mix(in srgb, #1A1110 4%, transparent)",
              }
            : {
                borderColor: "#e2e8f0",
                boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
              }
        }
      >
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: isCastingManager ? OLD_ROSE : "#64748b" }}
            >
              Casting · Talent ↔ marque
            </p>
            <h1
              className="mt-1 text-3xl font-semibold tracking-tight md:text-[2rem]"
              style={
                isCastingManager
                  ? { color: LICORICE, fontFamily: "Spectral, serif" }
                  : { color: "#0f172a" }
              }
            >
              Pipeline Casting
            </h1>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: isCastingManager ? OLD_ROSE : "#64748b" }}
            >
              Parcours individuel par étape. Les projets structurés (Ibiza, etc.)
              restent dans Projets outreach talent.
            </p>
            {pipelineProgress.total > 0 && (
              <div className="mt-4 max-w-md">
                <div
                  className="mb-1.5 flex items-center justify-between text-[11px] font-medium"
                  style={{ color: isCastingManager ? LICORICE : "#475569" }}
                >
                  <span>Avancement</span>
                  <span className="tabular-nums">
                    {pipelineProgress.doneish}/{pipelineProgress.total}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{
                    background: isCastingManager
                      ? "color-mix(in srgb, #1A1110 8%, white)"
                      : "#e2e8f0",
                  }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (pipelineProgress.doneish /
                            Math.max(1, pipelineProgress.total)) *
                            100
                        )
                      )}%`,
                      background: isCastingManager ? LICORICE : "#0f172a",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/strategy/projet-individuel-talent/mails-envoyes"
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-medium transition hover:bg-slate-50"
              style={
                isCastingManager
                  ? { borderColor: `color-mix(in srgb, ${OLD_ROSE} 40%, transparent)`, color: LICORICE }
                  : { borderColor: "#e2e8f0", color: "#0f172a" }
              }
              title="Voir les mails envoyés, ouvertures, clics et relances prévues"
            >
              <Mail className="h-4 w-4" />
              Mails envoyés
            </Link>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-medium transition hover:bg-slate-50"
              style={
                isCastingManager
                  ? { borderColor: `color-mix(in srgb, ${OLD_ROSE} 40%, transparent)`, color: LICORICE }
                  : { borderColor: "#e2e8f0", color: "#0f172a" }
              }
            >
              <RefreshCw className="h-4 w-4" />
              Rafraîchir
            </button>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          <select
            value={selectedTalentId}
            onChange={(e) => setSelectedTalentId(e.target.value)}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
            style={
              isCastingManager
                ? { borderColor: `color-mix(in srgb, ${OLD_ROSE} 40%, transparent)`, color: LICORICE }
                : { borderColor: "#e2e8f0" }
            }
          >
            <option value={ALL_TALENTS}>Tous les talents</option>
            {talents.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
            style={
              isCastingManager
                ? { borderColor: `color-mix(in srgb, ${OLD_ROSE} 40%, transparent)`, color: LICORICE }
                : { borderColor: "#e2e8f0" }
            }
            title="Trier les cartes de l'onglet actif par date de création"
          >
            <option value="oldest">Du plus ancien au plus récent</option>
            <option value="newest">Du plus récent au plus ancien</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <section className="space-y-3">
        <nav
          className="rounded-2xl border bg-white p-2"
          style={
            isCastingManager
              ? { borderColor: `color-mix(in srgb, ${OLD_ROSE} 20%, transparent)` }
              : { borderColor: "#e2e8f0" }
          }
          aria-label="Étapes du parcours"
        >
          <div className="flex flex-wrap gap-1.5">
            {visibleStages
              .filter((stage) => stage !== "LOST")
              .map((stage) => {
                const Icon = STAGE_ICON[stage];
                const count = stageCounts[stage] || 0;
                const active = activeStageTab === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => {
                      setActiveStageTab(stage);
                      if (stage === "DRAFTED_FOR_VALIDATION") setReadySubTab("cards");
                    }}
                    className="group inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition sm:flex-none"
                    style={
                      active
                        ? {
                            background: isCastingManager ? LICORICE : "#0f172a",
                            color: "#fff",
                          }
                        : {
                            background: "transparent",
                            color: isCastingManager ? LICORICE : "#334155",
                          }
                    }
                  >
                    <span
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: active ? "rgba(255,255,255,0.12)" : "#f1f5f9",
                        color: active ? "#fff" : "#64748b",
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight tracking-tight">
                        {stageLabelForRole(stage, role)}
                      </span>
                      <span
                        className="block text-[11px] leading-tight"
                        style={{ opacity: active ? 0.72 : 0.55 }}
                      >
                        {STAGE_HINT[stage]}
                      </span>
                    </span>
                    <span
                      className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                      style={{
                        background: active ? "rgba(255,255,255,0.14)" : "#f1f5f9",
                        color: active ? "#fff" : "#475569",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
          </div>

          <div
            className="mt-2 flex flex-wrap gap-1.5 border-t pt-2"
            style={{ borderColor: "#f1f5f9" }}
          >
            <button
              type="button"
              onClick={() => setActiveStageTab("AWAITING_ENRICH")}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-left transition"
              style={
                activeStageTab === "AWAITING_ENRICH"
                  ? {
                      background: isCastingManager ? LICORICE : "#0f172a",
                      color: "#fff",
                    }
                  : {
                      background: "#f8fafc",
                      color: isCastingManager ? LICORICE : "#334155",
                      border: "1px solid #e2e8f0",
                    }
              }
            >
              <ScanSearch className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="text-[12px] font-semibold">Enrichissement</span>
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                style={{
                  background:
                    activeStageTab === "AWAITING_ENRICH"
                      ? "rgba(255,255,255,0.14)"
                      : "#e2e8f0",
                }}
              >
                {awaitingEnrichMissions.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveStageTab("BLOCKED")}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-left transition"
              style={
                activeStageTab === "BLOCKED"
                  ? {
                      background: isCastingManager ? LICORICE : "#0f172a",
                      color: "#fff",
                    }
                  : {
                      background: "#f8fafc",
                      color: isCastingManager ? LICORICE : "#334155",
                      border: "1px solid #e2e8f0",
                    }
              }
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="text-[12px] font-semibold">Déjà contactées</span>
              <span className="text-[11px] opacity-60">
                {blockedBrandClusters.length} · 20 j
              </span>
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                style={{
                  background:
                    activeStageTab === "BLOCKED" ? "rgba(255,255,255,0.14)" : "#e2e8f0",
                }}
              >
                {blockedBrandClusters.length}
              </span>
            </button>
            {visibleStages.includes("LOST") && (
              <button
                type="button"
                onClick={() => setActiveStageTab("LOST")}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-left transition"
                style={
                  activeStageTab === "LOST"
                    ? {
                        background: isCastingManager ? LICORICE : "#0f172a",
                        color: "#fff",
                      }
                    : {
                        background: "#f8fafc",
                        color: isCastingManager ? LICORICE : "#334155",
                        border: "1px solid #e2e8f0",
                      }
                }
              >
                <XCircle className="h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="text-[12px] font-semibold">Perdu</span>
                <span
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                  style={{
                    background:
                      activeStageTab === "LOST" ? "rgba(255,255,255,0.14)" : "#e2e8f0",
                  }}
                >
                  {stageCounts.LOST || 0}
                </span>
              </button>
            )}
          </div>
        </nav>

        {activeStageTab === "AWAITING_ENRICH" ? (
        <div
          className="min-w-0 rounded-2xl border bg-white p-4 md:p-5"
          style={
            isCastingManager
              ? {
                  borderColor: `color-mix(in srgb, ${OLD_ROSE} 22%, transparent)`,
                }
              : { borderColor: "#e2e8f0" }
          }
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "#f1f5f9", color: "#475569" }}
              >
                <ScanSearch className="h-5 w-5" />
              </span>
              <div>
                <h2
                  className="text-xl font-semibold tracking-tight"
                  style={
                    isCastingManager
                      ? { color: LICORICE, fontFamily: "Spectral, serif" }
                      : { color: "#0f172a" }
                  }
                >
                  Enrichissement
                </h2>
                <p
                  className="text-sm"
                  style={{ color: isCastingManager ? OLD_ROSE : "#64748b" }}
                >
                  Contacts CRM à compléter — hors parcours jusqu&apos;à validation
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/enrichissement?tab=attente"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50"
                style={{
                  borderColor: "#e2e8f0",
                  color: "#334155",
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                File CRM
              </Link>
              <span
                className="rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums"
                style={{ background: "#f1f5f9", color: "#0f172a" }}
              >
                {awaitingEnrichMissions.length}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {awaitingEnrichMissions.map((m) => (
              <article
                key={m.id}
                className="min-w-0 overflow-hidden rounded-xl border bg-white p-4 shadow-sm"
                style={
                  isCastingManager
                    ? {
                        borderColor: `color-mix(in srgb, ${OLD_ROSE} 22%, transparent)`,
                        borderLeft: `3px solid ${LICORICE}`,
                      }
                    : {
                        borderColor: "#e2e8f0",
                        borderLeft: "3px solid #0f172a",
                      }
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p
                      className="text-sm font-semibold"
                      style={isCastingManager ? { color: LICORICE } : { color: "#0f172a" }}
                    >
                      {m.creatorName} → {brandDisplayName(m)}
                    </p>
                    <p
                      className="text-xs"
                      style={isCastingManager ? { color: OLD_ROSE } : { color: "#64748b" }}
                    >
                      {m.talentName || "Talent non renseigné"}
                      {m.contactsCompletionRequestedAt
                        ? ` · demandé le ${new Date(
                            m.contactsCompletionRequestedAt
                          ).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                    </p>
                    {m.draftEmailSubject ? (
                      <p
                        className="truncate text-xs opacity-80"
                        title={m.draftEmailSubject}
                        style={isCastingManager ? { color: OLD_ROSE } : { color: "#64748b" }}
                      >
                        {m.draftEmailSubject}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "#f1f5f9", color: "#475569" }}
                  >
                    En file
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.marqueId ? (
                    <Link
                      href={`/marques/${m.marqueId}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      Fiche CRM
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    disabled={updatingId === m.id}
                    onClick={() => void resolveEnrichissement(m.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: isCastingManager ? LICORICE : "#0f172a" }}
                  >
                    {updatingId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Contacts prêts
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === m.id}
                    onClick={() => void deleteMission(m)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
            {awaitingEnrichMissions.length === 0 && (
              <p
                className="col-span-full py-14 text-center text-sm"
                style={{ color: isCastingManager ? OLD_ROSE : "#64748b" }}
              >
                Aucune marque en enrichissement. Utilise « Enrichir » depuis Rédigé
                pour y envoyer une carte.
              </p>
            )}
          </div>
        </div>
        ) : activeStageTab !== "BLOCKED" ? (
        <div
          className="min-w-0 rounded-2xl border bg-white p-4 md:p-5"
          style={
            isCastingManager
              ? {
                  borderColor: `color-mix(in srgb, ${OLD_ROSE} 22%, transparent)`,
                }
              : { borderColor: "#e2e8f0" }
          }
        >
          {visibleStages
            .filter((stage) => stage === activeStageTab)
            .map((stage) => (
          <div key={stage} className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: "#f1f5f9", color: "#475569" }}
                >
                  <StageIcon className="h-5 w-5" />
                </span>
                <div>
                  <h2
                    className="text-xl font-semibold tracking-tight"
                    style={
                      isCastingManager
                        ? { color: LICORICE, fontFamily: "Spectral, serif" }
                        : { color: "#0f172a" }
                    }
                  >
                    {stageLabelForRole(stage, role)}
                  </h2>
                  <p
                    className="text-sm"
                    style={{ color: isCastingManager ? OLD_ROSE : "#64748b" }}
                  >
                    {STAGE_HINT[stage]} · {missionsForStage(stage).length} carte
                    {missionsForStage(stage).length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <span
                className="rounded-full px-3 py-1 text-sm font-semibold"
                style={{
                  background: isCastingManager ? OLD_LACE : "#f1f5f9",
                  color: isCastingManager ? LICORICE : "#0f172a",
                }}
              >
                {missionsForStage(stage).length}
              </span>
            </div>

            {stage === "DRAFTED_FOR_VALIDATION" && canUseReadyTab && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div
                  className="flex flex-wrap gap-1 rounded-xl border p-1"
                  style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}
                >
                  {(
                    [
                      {
                        id: "cards" as const,
                        label: "Cartes",
                        Icon: Sparkles,
                        count: missionsForStage(stage).length,
                      },
                      {
                        id: "contacts" as const,
                        label: "Contacts en base",
                        Icon: Database,
                        count: readyLoading && readySubTab !== "contacts" ? "…" : readyItems.length,
                      },
                      {
                        id: "enrich" as const,
                        label: "Sans contact",
                        Icon: UserPlus,
                        count: readyLoading && readySubTab !== "enrich" ? "…" : enrichItems.length,
                      },
                    ] as const
                  ).map((tab) => {
                    const active = readySubTab === tab.id;
                    const Icon = tab.Icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setReadySubTab(tab.id);
                          if (tab.id !== "cards") void loadReadyToSend();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition"
                        style={
                          active
                            ? {
                                background: isCastingManager ? LICORICE : "#0f172a",
                                color: "#fff",
                              }
                            : {
                                background: "transparent",
                                color: isCastingManager ? LICORICE : "#334155",
                              }
                        }
                      >
                        <Icon className="h-4 w-4 opacity-80" />
                        {tab.label}
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                          style={{
                            background: active ? "rgba(255,255,255,0.16)" : "#e2e8f0",
                            color: active ? "#fff" : "#475569",
                          }}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {(readySubTab === "contacts" || readySubTab === "enrich") && (
                  <button
                    type="button"
                    onClick={() => void loadReadyToSend()}
                    disabled={readyLoading || bulkScheduling}
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                    style={{ borderColor: "#e2e8f0" }}
                  >
                    {readyLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Relancer l&apos;analyse
                  </button>
                )}
              </div>
            )}

            {stage === "DRAFTED_FOR_VALIDATION" &&
              canUseReadyTab &&
              readySubTab === "contacts" && (
              <div className="mb-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleBulkAll}
                    disabled={readyItems.length === 0 || bulkScheduling}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {bulkSelectedMissionIds.size === readyItems.length && readyItems.length > 0
                      ? "Tout désélectionner"
                      : "Tout sélectionner"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void planifierBulkReady()}
                    disabled={bulkSelectedMissionIds.size === 0 || bulkScheduling}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {bulkScheduling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    Planifier la sélection ({bulkSelectedMissionIds.size})
                  </button>
                </div>
                {readyLoading && readyItems.length === 0 ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement…
                  </div>
                ) : readyItems.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">
                    Aucune mission rédigée avec un contact email disponible pour ce filtre.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
                    {readyItems.map((item) => {
                      const m = item.mission;
                      const selectedEmails = selectedEmailsByMission[m.id] || [];
                      const hasCooldown = item.availableContacts.some((c) => c.blockedByCooldown);
                      const isBusy = updatingId === m.id || bulkScheduling;
                      return (
                        <li
                          key={m.id}
                          className="grid gap-3 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-start"
                        >
                          <label className="flex items-start pt-1">
                            <input
                              type="checkbox"
                              checked={bulkSelectedMissionIds.has(m.id)}
                              onChange={() => toggleBulkMission(m.id)}
                              disabled={isBusy}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300"
                            />
                          </label>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {m.creatorName || m.talentName || "Talent"} → {brandDisplayName(m)}
                              </span>
                              {item.alreadyAttachedCount > 0 && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                  {item.alreadyAttachedCount} déjà attaché
                                  {item.alreadyAttachedCount > 1 ? "s" : ""}
                                </span>
                              )}
                              {hasCooldown && (
                                <span
                                  className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                                  title={`Au moins un contact a reçu un mail (autre mission) dans les ${readyCooldownDays} derniers jours`}
                                >
                                  Cooldown {readyCooldownDays}j
                                </span>
                              )}
                            </div>
                            {m.draftEmailSubject && (
                              <p
                                className="truncate text-sm text-gray-500"
                                title={m.draftEmailSubject}
                              >
                                Sujet : {m.draftEmailSubject}
                              </p>
                            )}
                            <div className="flex flex-col gap-1.5">
                              {item.availableContacts.map((c) => {
                                const checked = selectedEmails.includes(c.email);
                                return (
                                  <label
                                    key={c.id}
                                    className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-1 py-0.5 hover:border-gray-200 hover:bg-gray-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleReadyContact(m.id, c.email)}
                                      disabled={isBusy}
                                      className="mt-1 h-3.5 w-3.5 rounded border-gray-300"
                                    />
                                    <span className="text-sm text-gray-800">
                                      <span className="font-medium">
                                        {c.firstname}
                                        {c.lastname ? ` ${c.lastname}` : ""}
                                      </span>
                                      <span className="text-gray-500"> · {c.email}</span>
                                      {c.role ? (
                                        <span className="text-gray-400"> · {c.role}</span>
                                      ) : null}
                                      {c.principal ? (
                                        <span className="ml-1 text-xs text-emerald-700">
                                          (principal)
                                        </span>
                                      ) : null}
                                      {c.blockedByCooldown ? (
                                        <span className="ml-1 text-xs text-amber-700">
                                          (cooldown)
                                        </span>
                                      ) : null}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                            <button
                              type="button"
                              disabled={isBusy || selectedEmails.length === 0}
                              onClick={() => void planifierReadyItem(item)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 disabled:opacity-50"
                            >
                              {updatingId === m.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Clock className="h-3.5 w-3.5" />
                              )}
                              Planifier
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void queueForEnrichissement(m.id)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50"
                              style={{
                                borderColor: "#e2e8f0",
                                background: "#fff",
                                color: "#0f172a",
                              }}
                              title="Bascule dans l’onglet Enrichissement du pipeline"
                            >
                              <ScanSearch className="h-3.5 w-3.5" />
                              Enrichir
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {stage === "DRAFTED_FOR_VALIDATION" &&
              canUseReadyTab &&
              readySubTab === "enrich" && (
              <div className="mb-3 space-y-3">
                {readyLoading && enrichItems.length === 0 ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement…
                  </div>
                ) : enrichItems.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">
                    Aucune marque à enrichir — toutes les rédigées ont déjà un contact en base (ou
                    sont bloquées 20 j).
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-amber-100 bg-white">
                    {enrichItems.map((item) => {
                      const m = item.mission;
                      return (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {m.creatorName || m.talentName || "Talent"} →{" "}
                                {brandDisplayName(m)}
                              </span>
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                {item.reason === "no_marque"
                                  ? "Pas de fiche CRM"
                                  : "Aucun email en fiche"}
                              </span>
                            </div>
                            {m.draftEmailSubject && (
                              <p
                                className="truncate text-sm text-gray-500"
                                title={m.draftEmailSubject}
                              >
                                Sujet : {m.draftEmailSubject}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void queueForEnrichissement(m.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50"
                            style={{
                              borderColor: "#e2e8f0",
                              background: "#fff",
                              color: "#0f172a",
                            }}
                          >
                            {updatingId === m.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ScanSearch className="h-3.5 w-3.5" />
                            )}
                            Enrichir
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {!(
              stage === "DRAFTED_FOR_VALIDATION" &&
              canUseReadyTab &&
              readySubTab !== "cards"
            ) && (
            <>
            {stage === "SENT" && sentReminderCount > 0 && (
              <p className="mb-3 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {sentReminderCount} relance{sentReminderCount > 1 ? "s" : ""} à faire (3 jours ouvrés sans réponse)
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {missionsForStage(stage).map((m) => (
                (() => {
                  const reminderDue = manualReminderDue(m) && !ackedReminderIds.has(m.id);
                  return (
                <article
                  key={m.id}
                  id={`mission-card-${m.id}`}
                  className={
                    isCastingManager
                      ? "min-w-0 overflow-hidden bg-white rounded-2xl border shadow-sm p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                      : "min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  }
                  style={
                    isCastingManager
                      ? {
                          borderColor: `color-mix(in srgb, ${OLD_ROSE} 30%, transparent)`,
                          borderLeft: `4px solid ${columnAccentColor(stage, isCastingManager)}`,
                        }
                      : undefined
                  }
                >
                  {editingBrandId === m.id ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-sm font-semibold shrink-0"
                        style={isCastingManager ? { color: LICORICE } : { color: "#111827" }}
                      >
                        {m.creatorName} →
                      </span>
                      <input
                        autoFocus
                        value={editingBrandValue}
                        onChange={(e) => setEditingBrandValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveBrand(m);
                          if (e.key === "Escape") cancelEditBrand();
                        }}
                        className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-sm"
                        placeholder="Nom de la marque"
                      />
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() => void saveBrand(m)}
                        className="shrink-0 rounded border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 disabled:opacity-50"
                        title="Enregistrer"
                      >
                        {updatingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditBrand}
                        className="shrink-0 rounded border border-gray-200 bg-white p-1 text-gray-500"
                        title="Annuler"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="group/brand flex items-center gap-1 text-sm font-semibold"
                      style={isCastingManager ? { color: LICORICE } : { color: "#111827" }}
                    >
                      <span>
                        {m.creatorName} → {brandDisplayName(m)}
                      </span>
                      {canEditBrand && (
                        <button
                          type="button"
                          onClick={() => startEditBrand(m)}
                          className="opacity-0 group-hover/brand:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-700 transition-opacity"
                          title="Corriger le nom de la marque"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </p>
                  )}
                  <p className="text-xs" style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}>
                    Talent: {m.talentName || "Non renseigné"}
                  </p>
                  {reminderDue && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Rappel 3 jours ouvrés : relance client à faire
                    </p>
                  )}
                  {(() => {
                    const planned = scheduledSends.find((s) => s.missionId === m.id);
                    if (!planned) return null;
                    const remaining = Math.max(0, Math.ceil((planned.scheduledAt - nowTick) / 1000));
                    return (
                      <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        Envoi auto dans {remaining}s
                      </p>
                    );
                  })()}
                  {m.sentAt && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Envoyé via Leyna le {new Date(m.sentAt).toLocaleDateString("fr-FR")}
                      {typeof m.openCount === "number" && m.openCount > 0 ? ` · ${m.openCount} ouverture${m.openCount > 1 ? "s" : ""}` : ""}
                    </p>
                  )}
                  {m.relanceSentAt && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      Relance J+3 envoyée le {new Date(m.relanceSentAt).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                  {(() => {
                    const plannedR2 = relance2PlannedAt(m);
                    if (!plannedR2) return null;
                    return (
                      <p
                        className="mt-1 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                        title="Relance « valeur ajoutée » automatique (media kit, stats, call) envoyée 10 jours ouvrés après la relance J+3 aux contacts restés sans réponse."
                      >
                        <Clock className="h-3 w-3" />
                        Relance 2 prévue le {plannedR2.toLocaleDateString("fr-FR")}
                      </p>
                    );
                  })()}
                  {m.relance2SentAt && (
                    <p
                      className="mt-1 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                      title="Relance « valeur ajoutée » (media kit, stats, call) envoyée 10 jours ouvrés après la relance J+3, aux contacts restés sans réponse."
                    >
                      Relance 2 envoyée le {new Date(m.relance2SentAt).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                  {m.replied && (
                    <p
                      className="mt-1 inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700"
                      title="Au moins un contact a répondu : il n'est plus relancé. Les autres contacts restés sans réponse reçoivent quand même leur relance J+3."
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Client a répondu
                    </p>
                  )}
                  {!m.replied && m.relanceCancelledAt && (!m.relanceSentAt || !m.relance2SentAt) && (
                    <p
                      className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                      title={`Stoppée manuellement le ${new Date(m.relanceCancelledAt).toLocaleString("fr-FR")}`}
                    >
                      <BellOff className="h-3 w-3" />
                      Relance auto stoppée
                    </p>
                  )}
                  {m.sendError && (
                    <p className="mt-1 text-[11px] text-red-600" title={m.sendError}>
                      Erreur d'envoi (partielle) — voir détails
                    </p>
                  )}
                  {m.status === "RELANCED" && !m.relanceSentAt && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      Relancé
                    </p>
                  )}
                  <p
                    className="mt-1 text-[11px]"
                    style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}
                    title="La langue d'envoi est captée automatiquement depuis la fiche client (fiche marque) : chaque contact reçoit le mail dans sa langue, traduit auto si besoin."
                  >
                    🌐 Langue captée depuis la fiche client (traduction auto à l'envoi)
                  </p>
                  {Array.isArray(m.clientContacts) && m.clientContacts.length > 0 && (
                    <p className="text-xs" style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}>
                      {m.clientContacts.length} contact{m.clientContacts.length > 1 ? "s" : ""} enregistré
                    </p>
                  )}
                  <p className="text-xs" style={isCastingManager ? { color: LICORICE, opacity: 0.85 } : { color: "#4B5563" }}>
                    {m.strategyReason}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {role === "ADMIN" && (
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() =>
                          setContactFormByMission((prev) => ({
                            ...prev,
                            [m.id]: {
                              open: !prev[m.id]?.open,
                              contacts:
                                prev[m.id]?.contacts?.length
                                  ? prev[m.id].contacts
                                  : [{ firstname: "", lastname: "", email: "", role: "" }],
                            },
                          }))
                        }
                        className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700"
                      >
                        {contactFormByMission[m.id]?.open
                          ? "Fermer contacts"
                          : "Ajouter contact client"}
                      </button>
                    )}
                    {role === "CASTING_MANAGER" && stage === "TO_DRAFT" && (
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() => void openComposer(m)}
                        className="rounded px-2 py-1 text-xs"
                        style={
                          isCastingManager
                            ? { border: `1px solid ${OLD_ROSE}`, backgroundColor: OLD_LACE, color: LICORICE }
                            : { border: "1px solid #D1D5DB" }
                        }
                      >
                        {updatingId === m.id ? "Ouverture..." : "Rédiger"}
                      </button>
                    )}
                    {role === "CASTING_MANAGER" && stage === "DRAFTED_FOR_VALIDATION" && (
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() => void openComposer(m)}
                        className="rounded px-2 py-1 text-xs"
                        style={
                          isCastingManager
                            ? { border: `1px solid ${OLD_ROSE}`, backgroundColor: OLD_LACE, color: LICORICE }
                            : { border: "1px solid #D1D5DB" }
                        }
                      >
                        {updatingId === m.id ? "Ouverture..." : "Revoir le mail"}
                      </button>
                    )}
                    {(role === "ADMIN" || role === "HEAD_OF" || role === "STRATEGY_PLANNER") &&
                      (stage === "TO_DRAFT" ||
                        stage === "DRAFTED_FOR_VALIDATION" ||
                        stage === "TO_SEND" ||
                        stage === "SENT") && (
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void openComposer(m)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          {updatingId === m.id
                            ? "Ouverture..."
                            : stage === "TO_DRAFT"
                              ? "Rédiger"
                              : "Modifier le mail"}
                        </button>
                      )}
                    {role === "HEAD_OF_SALES" && stage === "DRAFTED_FOR_VALIDATION" && (
                      <>
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void openComposer(m)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          {updatingId === m.id ? "Ouverture..." : "Afficher mail"}
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void scheduleSend(m)}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700"
                          title="Valide et déclenche l'envoi auto depuis leyna@glowupagence.fr dans 30s"
                        >
                          {updatingId === m.id ? "Validation..." : "Valider → envoi auto"}
                        </button>
                      </>
                    )}
                    {(role === "HEAD_OF_SALES" || role === "ADMIN" || role === "HEAD_OF") &&
                      stage === "TO_SEND" && (
                        <>
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void openComposer(m)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            {updatingId === m.id ? "Ouverture..." : "Afficher mail"}
                          </button>
                          {m.scheduledSendAt && (
                            <button
                              type="button"
                              disabled={updatingId === m.id}
                              onClick={() => void cancelSend(m.id)}
                              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                            >
                              Annuler l'envoi
                            </button>
                          )}
                        </>
                      )}
                    {(role === "HEAD_OF_SALES" || role === "ADMIN" || role === "HEAD_OF") &&
                      stage === "SENT" &&
                      m.scheduledSendAt && (
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void cancelSend(m.id)}
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                        >
                          Annuler l'envoi additionnel
                        </button>
                      )}
                    {(role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_SALES" || role === "STRATEGY_PLANNER") &&
                      stage === "SENT" &&
                      reminderDue && (
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => {
                            setAckedReminderIds((prev) => new Set(prev).add(m.id));
                            void patchMission(m.id, { stage: "SENT", status: "RELANCED" }).catch(
                              () => {}
                            );
                          }}
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                        >
                          Relancer
                        </button>
                      )}
                    {(role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_SALES" || role === "STRATEGY_PLANNER") &&
                      stage === "SENT" &&
                      !m.replied &&
                      (!m.relanceSentAt || !m.relance2SentAt) && (
                        m.relanceCancelledAt ? (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void toggleRelanceCancellation(m, "resume")}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                            title="Réactiver les relances automatiques (J+3 puis relance 2 à J+10)"
                          >
                            <BellRing className="h-3 w-3" />
                            Réactiver relance
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void toggleRelanceCancellation(m, "cancel")}
                            className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                            title={
                              m.relanceSentAt
                                ? "Stopper la relance 2 automatique (J+10 après la relance J+3)"
                                : "Stopper les relances automatiques (J+3 puis relance 2 à J+10)"
                            }
                          >
                            <BellOff className="h-3 w-3" />
                            Stopper relance
                          </button>
                        )
                      )}
                    {(role === "ADMIN" ||
                      role === "HEAD_OF" ||
                      role === "STRATEGY_PLANNER" ||
                      role === "CASTING_MANAGER") &&
                      stage !== "SENT" &&
                      stage !== "RESPONSE_RECEIVED" &&
                      stage !== "IN_NEGOTIATION" &&
                      stage !== "WON" && (
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void deleteMission(m)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          title="Supprimer définitivement cette carte"
                        >
                          <Trash2 className="h-3 w-3" />
                          Supprimer
                        </button>
                      )}
                    {(role === "ADMIN" || role === "HEAD_OF") && (
                      <>
                        {stage !== "WON" && (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void patchMission(m.id, { stage: "WON" }).catch(() => {})}
                            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                          >
                            Gagné
                          </button>
                        )}
                        {stage !== "LOST" && (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void patchMission(m.id, { stage: "LOST" }).catch(() => {})}
                            className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                          >
                            Perdu
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {role === "ADMIN" && contactFormByMission[m.id]?.open && (
                    <div className="mt-2 grid min-w-0 gap-2 rounded-lg border border-gray-200 p-2">
                      <div className="grid min-w-0 gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 p-2">
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-gray-600">
                            Pas les contacts ? Cherche la marque dans la base interne
                          </span>
                          <button
                            type="button"
                            disabled={contactSearchByMission[m.id]?.loading}
                            onClick={() => void searchClientContacts(m)}
                            className="inline-flex w-full items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs disabled:opacity-50"
                          >
                            {contactSearchByMission[m.id]?.loading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Rechercher « {brandDisplayName(m)} »
                          </button>
                        </div>
                        <div className="grid gap-1 border-t border-dashed border-gray-300 pt-2">
                          <span className="text-[11px] font-medium text-gray-500">
                            Mauvaise orthographe ? Cherche dans la base marque
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              value={brandSearchByMission[m.id]?.query || ""}
                              onChange={(e) =>
                                setBrandSearchByMission((prev) => ({
                                  ...prev,
                                  [m.id]: {
                                    query: e.target.value,
                                    loading: prev[m.id]?.loading || false,
                                    results: prev[m.id]?.results || [],
                                    searched: prev[m.id]?.searched || false,
                                  },
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void searchBrands(m.id);
                                }
                              }}
                              placeholder="ex. star → Starbucks"
                              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              disabled={
                                brandSearchByMission[m.id]?.loading ||
                                (brandSearchByMission[m.id]?.query || "").trim().length < 2
                              }
                              onClick={() => void searchBrands(m.id)}
                              className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                            >
                              {brandSearchByMission[m.id]?.loading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              Chercher
                            </button>
                          </div>
                          {brandSearchByMission[m.id]?.searched &&
                            !brandSearchByMission[m.id]?.loading &&
                            (brandSearchByMission[m.id]?.results.length ?? 0) === 0 && (
                              <p className="text-[11px] text-gray-500">
                                Aucune marque « {brandSearchByMission[m.id]?.query} » dans la base.
                              </p>
                            )}
                          {(brandSearchByMission[m.id]?.results.length ?? 0) > 0 && (
                            <ul className="grid min-w-0 gap-1">
                              {brandSearchByMission[m.id]?.results.map((b) => (
                                <li
                                  key={b.id}
                                  className="flex min-w-0 flex-col gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-gray-800">
                                      {b.nom}
                                    </p>
                                    <p className="truncate text-[11px] text-gray-500">
                                      {b.contactCount} contact{b.contactCount > 1 ? "s" : ""}
                                      {b.ville ? ` · ${b.ville}` : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={contactSearchByMission[m.id]?.loading}
                                    onClick={() => void searchClientContacts(m, b.nom)}
                                    className="w-full rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-700 disabled:opacity-50"
                                  >
                                    Voir les contacts
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {contactSearchByMission[m.id]?.searched &&
                          !contactSearchByMission[m.id]?.loading &&
                          (contactSearchByMission[m.id]?.results.length ?? 0) === 0 && (
                            <p className="text-xs text-gray-500">
                              Aucun contact trouvé pour « {brandDisplayName(m)} » dans la base
                              interne. Saisis-les manuellement ci-dessous.
                            </p>
                          )}
                        {(contactSearchByMission[m.id]?.results.length ?? 0) > 0 && (
                          <ul className="grid min-w-0 gap-1">
                            {contactSearchByMission[m.id]?.results.map((sc) => {
                              const scEmail = sc.email.trim().toLowerCase();
                              const already =
                                !!scEmail &&
                                (contactFormByMission[m.id]?.contacts || []).some(
                                  (c) => c.email.trim().toLowerCase() === scEmail
                                );
                              return (
                                <li
                                  key={sc.id || sc.email}
                                  className="flex min-w-0 flex-col gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5"
                                >
                                  <div className="min-w-0">
                                    <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-gray-800">
                                      <span className="min-w-0 break-words">
                                        {[sc.firstname, sc.lastname].filter(Boolean).join(" ") ||
                                          sc.email ||
                                          "Contact sans nom"}
                                      </span>
                                      <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                                        App
                                      </span>
                                      {!scEmail && (
                                        <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                          email à compléter
                                        </span>
                                      )}
                                    </p>
                                    <p className="break-all text-[11px] text-gray-500">
                                      {sc.email || "— email manquant —"}
                                      {sc.companyName ? ` · ${sc.companyName}` : ""}
                                      {sc.role ? ` · ${sc.role}` : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={already}
                                    onClick={() => addSearchedContactToForm(m.id, sc)}
                                    className="w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-700 disabled:opacity-50"
                                  >
                                    {already ? "Ajouté" : "+ Ajouter"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                      {(contactFormByMission[m.id]?.contacts || []).map((contact, index) => (
                        <div key={`${m.id}-contact-${index}`} className="grid min-w-0 grid-cols-1 gap-2">
                          <input
                            value={contact.firstname}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, firstname: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Prénom*"
                            className="min-w-0 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={contact.lastname}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, lastname: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Nom"
                            className="min-w-0 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={contact.email}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, email: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Email*"
                            className="min-w-0 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={contact.role}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, role: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Rôle / Poste"
                            className="min-w-0 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setContactFormByMission((prev) => ({
                            ...prev,
                            [m.id]: {
                              open: true,
                              contacts: [
                                ...(prev[m.id]?.contacts || []),
                                { firstname: "", lastname: "", email: "", role: "" },
                              ],
                            },
                          }))
                        }
                        className="text-left text-xs font-medium text-[#C08B8B]"
                      >
                        + Ajouter un contact
                      </button>
                      <select
                        value={m.clientLanguage || "FR"}
                        onChange={(e) =>
                          void patchMission(m.id, {
                            clientLanguage: e.target.value === "EN" ? "EN" : "FR",
                          }).catch(() => {})
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="FR">Client français</option>
                        <option value="EN">Client anglais</option>
                      </select>
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() => void addClientContact(m)}
                        className="w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700"
                      >
                        Enregistrer contact
                      </button>
                    </div>
                  )}
                </article>
                  );
                })()
              ))}
              {missionsForStage(stage).length === 0 && (
                <p
                  className={`text-sm ${isCastingManager ? "text-center py-16 opacity-70" : "text-center py-16 text-gray-500"}`}
                  style={isCastingManager ? { color: OLD_ROSE } : undefined}
                >
                  Rien ici pour l&apos;instant — change d&apos;onglet ou rafraîchis.
                </p>
              )}
            </div>
            </>
            )}
          </div>
        ))}
        </div>
        ) : (
        <div
          className="min-w-0 rounded-2xl border bg-white p-4 md:p-5"
          style={
            isCastingManager
              ? {
                  borderColor: `color-mix(in srgb, ${OLD_ROSE} 22%, transparent)`,
                }
              : { borderColor: "#e2e8f0" }
          }
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "#f1f5f9", color: "#475569" }}
              >
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <h2
                  className="text-xl font-semibold tracking-tight"
                  style={
                    isCastingManager
                      ? { color: LICORICE, fontFamily: "Spectral, serif" }
                      : { color: "#0f172a" }
                  }
                >
                  Déjà contactées
                </h2>
                <p
                  className="text-sm"
                  style={{ color: isCastingManager ? OLD_ROSE : "#64748b" }}
                >
                  1 vague / marque / 20 j — déblocage automatique
                </p>
              </div>
            </div>
            <span
              className="rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums"
              style={{ background: "#f1f5f9", color: "#0f172a" }}
            >
              {blockedBrandClusters.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {blockedBrandClusters.map((cluster) => {
              const sentTalents = cluster.talents.filter((t) => t.sentAt);
              const waitingTalents = cluster.talents.filter((t) => !t.sentAt);
              const sentNames = [
                ...new Set(sentTalents.map((t) => t.name).filter(Boolean)),
              ];
              return (
                <article
                  key={cluster.key}
                  className={
                    isCastingManager
                      ? "min-w-0 overflow-hidden bg-white rounded-xl border shadow-sm p-3"
                      : "min-w-0 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 p-2"
                  }
                  style={
                    isCastingManager
                      ? {
                          borderColor: `color-mix(in srgb, ${OLD_ROSE} 30%, transparent)`,
                          borderLeft: "4px solid #F59E0B",
                        }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className="text-sm font-semibold min-w-0 truncate"
                        style={isCastingManager ? { color: LICORICE } : { color: "#111827" }}
                        title={cluster.brandLabel}
                      >
                        {cluster.brandLabel}
                      </p>
                      <p
                        className="mt-0.5 text-[11px] font-medium truncate"
                        style={isCastingManager ? { color: "#B45309" } : { color: "#92400E" }}
                        title={sentNames.join(", ")}
                      >
                        Déjà contactée pour : {sentNames.join(", ") || "—"}
                      </p>
                      {cluster.variants.length > 1 && (
                        <p
                          className="mt-0.5 text-[11px] truncate opacity-70"
                          title={cluster.variants.join(" · ")}
                          style={isCastingManager ? { color: OLD_ROSE } : { color: "#92400E" }}
                        >
                          aussi :{" "}
                          {cluster.variants
                            .filter((v) => v !== cluster.brandLabel)
                            .slice(0, 3)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                      title={`Dernier envoi le ${cluster.lastSentAt.toLocaleDateString("fr-FR")}`}
                    >
                      Bloqué {cluster.daysLeft} j
                    </span>
                  </div>
                  {sentTalents.length > 0 && (
                    <div className="mt-2">
                      <p
                        className="text-[11px] font-medium uppercase tracking-wide"
                        style={isCastingManager ? { color: OLD_ROSE } : { color: "#92400E" }}
                      >
                        Envoyé
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {sentTalents.map((t) => (
                          <li
                            key={t.missionId}
                            className="text-xs"
                            style={isCastingManager ? { color: LICORICE } : { color: "#374151" }}
                          >
                            {t.name}
                            {t.sentAt ? (
                              <span className="opacity-60">
                                {" "}
                                · {new Date(t.sentAt).toLocaleDateString("fr-FR")}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {waitingTalents.length > 0 && (
                    <div className="mt-2">
                      <p
                        className="text-[11px] font-medium uppercase tracking-wide"
                        style={isCastingManager ? { color: OLD_ROSE } : { color: "#92400E" }}
                      >
                        Autres talents bloqués ({waitingTalents.length})
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {waitingTalents.map((t) => (
                          <li
                            key={t.missionId}
                            className="text-xs"
                            style={isCastingManager ? { color: LICORICE, opacity: 0.85 } : { color: "#6B7280" }}
                          >
                            {t.name}
                            <span className="opacity-60">
                              {" "}
                              · {STAGE_LABEL[t.stage] || t.stage}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
            {blockedBrandClusters.length === 0 && (
              <p
                className={`text-sm ${isCastingManager ? "text-center py-16 opacity-70" : "text-center py-16 text-gray-500"}`}
                style={isCastingManager ? { color: OLD_ROSE } : undefined}
              >
                Aucune marque bloquée — tout est jouable.
              </p>
            )}
          </div>
        </div>
        )}
      </section>

      {loading && (
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement...
        </div>
      )}

      {scheduledSends.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[360px] flex-col gap-2">
          {scheduledSends.map((planned) => {
            const remaining = Math.max(0, Math.ceil((planned.scheduledAt - nowTick) / 1000));
            return (
              <div
                key={planned.missionId}
                className="rounded-xl border border-blue-200 bg-white p-3 shadow-lg"
              >
                <p className="text-sm font-semibold text-blue-900">
                  Envoi auto dans {remaining}s
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {planned.brandLabel} · depuis leyna@glowupagence.fr
                </p>
                <button
                  type="button"
                  onClick={() => void cancelSend(planned.missionId)}
                  disabled={remaining <= 0}
                  className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            );
          })}
        </div>
      )}

      <CastingComposer
        open={composerOpen}
        contact={composerContact}
        brandColumn={"todo"}
        useHubspot={false}
        onClose={() => {
          setComposerOpen(false);
          setComposerContact(null);
        }}
        onSaved={async (
          status: "pret" | "en_cours" | "reset",
          draft?: { subject: string; bodyHtml: string; language?: "fr" | "en" }
        ) => {
          const missionId = composerContact?.missionBrief?.id as string | undefined;
          if (!missionId) return;
          const draftLanguage: "fr" | "en" = draft?.language === "en" ? "en" : "fr";
          const currentStage = composerContact?.missionBrief?.stage as Stage | undefined;
          if (status === "pret") {
            await patchMission(missionId, {
              stage: "DRAFTED_FOR_VALIDATION",
              status: "EMAIL_DRAFTED",
              draftEmailSubject: draft?.subject ?? "",
              draftEmailBody: draft?.bodyHtml ?? "",
              draftLanguage,
            });
            setComposerContact((prev: any) =>
              prev
                ? {
                    ...prev,
                    missionBrief: {
                      ...prev.missionBrief,
                      stage: "DRAFTED_FOR_VALIDATION",
                    },
                  }
                : prev
            );
          } else if (status === "en_cours") {
            // Ne pas rétrograder une carte déjà en validation / envoi :
            // un admin qui modifie puis « Enregistrer brouillon » doit
            // garder la carte accessible dans sa colonne actuelle.
            const keepStage =
              currentStage === "DRAFTED_FOR_VALIDATION" ||
              currentStage === "TO_SEND" ||
              currentStage === "SENT"
                ? currentStage
                : "TO_DRAFT";
            await patchMission(missionId, {
              stage: keepStage,
              status: "EMAIL_DRAFTED",
              draftEmailSubject: draft?.subject ?? "",
              draftEmailBody: draft?.bodyHtml ?? "",
              draftLanguage,
            });
            setComposerContact((prev: any) =>
              prev
                ? {
                    ...prev,
                    missionBrief: {
                      ...prev.missionBrief,
                      stage: keepStage,
                    },
                  }
                : prev
            );
          }
        }}
        onError={(msg) => setError(msg)}
        onSuccess={(msg) => {
          setSuccess(msg);
          void loadMissions();
        }}
      />
    </main>
  );
}
