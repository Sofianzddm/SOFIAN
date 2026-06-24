"use client";

/**
 * Module Outreach — cycle de contact clients 45 jours.
 *
 * Files : À contacter (nouveaux clients) → En attente (mail envoyé,
 * relance auto J+3, compteur 45j) → À recontacter (J+45 écoulés, nouveau
 * mail à rédiger) → et on boucle. La réponse d'un client est affichée comme
 * info mais ne le sort PAS du cycle ; seul un stop manuel le fait.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Mail,
  Plus,
  Repeat,
  X,
  Eye,
  MousePointerClick,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  StopCircle,
  PlayCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  MessageSquareReply,
  Cloud,
  PenLine,
  FileSpreadsheet,
  ExternalLink,
  UserPlus,
  MailWarning,
  Search,
  ArrowUpDown,
} from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";
import { businessDaysAfter } from "@/lib/business-days";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const ALLOWED = ["ADMIN", "CASTING_MANAGER"];
// Doit rester aligné avec OUTREACH_RELANCE_BUSINESS_DAYS (lib/outreach-send.ts).
const RELANCE_BUSINESS_DAYS = 3;

type TargetStatus = "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED";

type TouchSummary = {
  id: string;
  cycleNumber: number;
  subject: string;
  sentAt: string | null;
  relanceSentAt: string | null;
  repliedAt: string | null;
  openCount: number;
  openedAt: string | null;
  lastOpenAt: string | null;
  clickCount: number;
  clickedAt: string | null;
  lastClickAt: string | null;
  sendError: string | null;
};

type TouchClick = {
  id: string;
  url: string;
  clickedAt: string;
};

type Touch = TouchSummary & {
  bodyHtml: string;
  relanceError: string | null;
  lastClickUrl: string | null;
  clicks?: TouchClick[];
};

type Target = {
  id: string;
  marqueId: string;
  firstname: string;
  lastname: string | null;
  email: string;
  company: string;
  language: string;
  fromEmail: string | null;
  status: TargetStatus;
  draftSubject: string | null;
  draftBodyHtml: string | null;
  cycleCount: number;
  lastSentAt: string | null;
  nextRecontactAt: string | null;
  lastRepliedAt: string | null;
  autoRescheduleReason: string | null;
  autoRescheduledAt: string | null;
  hubspotContactId: string | null;
  hubspotSyncedAt: string | null;
  createdAt: string;
  touches: TouchSummary[];
};

/** Boîte Gmail connectée, utilisable comme expéditrice d'un cycle. */
type SenderAccount = {
  email: string;
  label: string;
};

const DEFAULT_SENDER_EMAIL = "leyna@glowupagence.fr";

function senderLabel(accounts: SenderAccount[], fromEmail: string | null): string {
  const email = (fromEmail || "").trim().toLowerCase() || DEFAULT_SENDER_EMAIL;
  const account = accounts.find((a) => a.email.toLowerCase() === email);
  if (account) return account.label;
  if (email === DEFAULT_SENDER_EMAIL) return "Leyna";
  return email;
}

/** Résultat final renvoyé par /api/outreach/send-bulk (mode flux ou JSON). */
type BulkSendResult = {
  sent: number;
  failed: { email: string; error: string }[];
  needsConfirmation: {
    targetId: string;
    email: string;
    message: string;
    suggestedNextRecontactAt?: string;
  }[];
  hubspotSynced?: number;
  translated: number;
  translationFailed: "en" | "fr" | null;
};

/**
 * Appelle /api/outreach/send-bulk en mode flux (NDJSON) et relaie chaque
 * événement de progression à `onProgress`, puis renvoie le résultat final.
 * Si le serveur ne renvoie pas de flux (anciennes réponses JSON), on retombe
 * proprement sur un parse JSON classique.
 */
async function sendBulkStreaming(
  payload: {
    targetIds: string[];
    subject: string;
    bodyHtml: string;
    sourceLanguage: "fr" | "en";
    force?: boolean;
  },
  onProgress: (p: { done: number; total: number; label: string }) => void
): Promise<BulkSendResult> {
  const res = await fetch("/api/outreach/send-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }),
  });

  const contentType = res.headers.get("Content-Type") || "";
  if (!res.body || !contentType.includes("ndjson")) {
    // Pas de flux : réponse JSON simple (ou erreur).
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur d'envoi");
    return data as BulkSendResult;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: BulkSendResult | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (event.type === "progress") {
      onProgress({
        done: Number(event.done) || 0,
        total: Number(event.total) || 0,
        label: String(event.label || ""),
      });
    } else if (event.type === "result") {
      result = event as unknown as BulkSendResult;
    } else if (event.type === "error") {
      throw new Error(String(event.error || "Erreur d'envoi"));
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nlIndex: number;
    while ((nlIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nlIndex);
      buffer = buffer.slice(nlIndex + 1);
      handleLine(line);
    }
  }
  if (buffer) handleLine(buffer);

  if (!result) throw new Error("Réponse d'envoi incomplète.");
  return result;
}

/** Contact importé depuis une cartographie (fichier Claude/Excel), en attente d'email. */
type PendingContact = {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  language: string;
  marqueId: string;
  company: string;
};

const TAB_DEFS: { key: TargetStatus; label: string }[] = [
  { key: "TO_CONTACT", label: "À contacter" },
  { key: "WAITING", label: "En attente" },
  { key: "TO_RECONTACT", label: "À recontacter" },
  { key: "STOPPED", label: "Stoppés" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Date + heure (utile pour la dernière ouverture, à la minute près). */
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ancienneté lisible ("il y a 2h", "il y a 3j") pour la dernière ouverture. */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.floor(d / 30);
  return `il y a ${mo} mois`;
}

type SortKey = "default" | "opens" | "lastOpen" | "clicks" | "notOpened";

const SORT_DEFS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Tri par défaut" },
  { key: "opens", label: "Plus d'ouvertures" },
  { key: "lastOpen", label: "Vu récemment" },
  { key: "clicks", label: "Plus de clics" },
  { key: "notOpened", label: "Jamais ouverts" },
];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/** Libellé lisible pour un lien cliqué dans un mail (profil Insta/TikTok, talentbook…). */
function clickLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const firstSegment = u.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("instagram.com")) {
      const reserved = ["p", "reel", "reels", "stories", "explore"];
      if (firstSegment && !reserved.includes(firstSegment)) return `@${firstSegment}`;
      return "Instagram";
    }
    if (host.endsWith("tiktok.com")) {
      if (firstSegment.startsWith("@")) return `${firstSegment} (TikTok)`;
      return "TikTok";
    }
    if (u.pathname.toLowerCase().includes("talentbook")) return "Talentbook";
    return host;
  } catch {
    return url;
  }
}

/** Regroupe les clics par URL : un badge par lien avec le nombre de clics. */
function groupClicks(
  clicks: TouchClick[]
): { url: string; label: string; count: number; lastAt: string }[] {
  const map = new Map<string, { url: string; label: string; count: number; lastAt: string }>();
  for (const click of clicks) {
    const existing = map.get(click.url);
    if (existing) {
      existing.count += 1;
      if (click.clickedAt > existing.lastAt) existing.lastAt = click.clickedAt;
    } else {
      map.set(click.url, {
        url: click.url,
        label: clickLabel(click.url),
        count: 1,
        lastAt: click.clickedAt,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export default function OutreachPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role || "";
  const isAdmin = role === "ADMIN";

  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TargetStatus>("TO_CONTACT");
  const [sortBy, setSortBy] = useState<SortKey>("default");
  const [searchTerm, setSearchTerm] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showCartoModal, setShowCartoModal] = useState(false);
  const [pendingContacts, setPendingContacts] = useState<PendingContact[]>([]);
  const [editTarget, setEditTarget] = useState<Target | null>(null);
  const [composerGroup, setComposerGroup] = useState<{
    company: string;
    targets: Target[];
  } | null>(null);
  const [senderAccounts, setSenderAccounts] = useState<SenderAccount[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTouches, setExpandedTouches] = useState<Touch[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [checkingBounces, setCheckingBounces] = useState(false);
  // Progression de l'envoi groupé (traduction + envoi), affichée en overlay
  // quand plusieurs contacts sont concernés.
  const [sendProgress, setSendProgress] = useState<{
    done: number;
    total: number;
    label: string;
  } | null>(null);

  const flash = useCallback((kind: "success" | "error", message: string) => {
    if (kind === "success") {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 4000);
    } else {
      setError(message);
      setTimeout(() => setError(null), 6000);
    }
  }, []);

  const loadTargets = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/targets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      setTargets(data.targets || []);
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [flash]);

  const loadPendingContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/pending-contacts");
      const data = await res.json();
      if (res.ok) setPendingContacts(data.contacts || []);
    } catch {
      /* non bloquant */
    }
  }, []);

  const loadSenderAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/accounts");
      const data = (await res.json().catch(() => ({}))) as {
        accounts?: Array<{
          email: string;
          displayName: string | null;
          user: { prenom: string; nom: string } | null;
        }>;
      };
      if (res.ok) {
        setSenderAccounts(
          (data.accounts || []).map((a) => ({
            email: a.email,
            label:
              a.displayName ||
              (a.user ? `${a.user.prenom} ${a.user.nom}`.trim() : a.email),
          }))
        );
      }
    } catch {
      /* non bloquant : fallback Leyna */
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated" && ALLOWED.includes(role)) {
      loadTargets();
      loadPendingContacts();
      loadSenderAccounts();
    }
  }, [sessionStatus, role, loadTargets, loadPendingContacts, loadSenderAccounts]);

  const counts = useMemo(() => {
    const c: Record<TargetStatus, number> = {
      TO_CONTACT: 0,
      WAITING: 0,
      TO_RECONTACT: 0,
      STOPPED: 0,
    };
    for (const t of targets) c[t.status] += 1;
    return c;
  }, [targets]);

  const visibleTargets = useMemo(
    () => targets.filter((t) => t.status === activeTab),
    [targets, activeTab]
  );

  /**
   * Regroupement par marque : un seul mail rédigé pour tous les contacts
   * d'une même boîte, envoyé individuellement à chacun. Dans « À contacter »,
   * on affiche aussi les contacts de carto importés sans email (il suffit
   * de noter le mail pour les faire entrer dans le cycle).
   */
  const visibleGroups = useMemo(() => {
    const map = new Map<
      string,
      { marqueId: string; company: string; targets: Target[]; pending: PendingContact[] }
    >();
    for (const t of visibleTargets) {
      const key = t.marqueId;
      const group = map.get(key);
      if (group) group.targets.push(t);
      else map.set(key, { marqueId: key, company: t.company, targets: [t], pending: [] });
    }
    if (activeTab === "TO_CONTACT") {
      for (const c of pendingContacts) {
        const group = map.get(c.marqueId);
        if (group) group.pending.push(c);
        else
          map.set(c.marqueId, {
            marqueId: c.marqueId,
            company: c.company,
            targets: [],
            pending: [c],
          });
      }
    }

    let groups = Array.from(map.values());

    // Recherche : marque, nom du contact ou email.
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      groups = groups.filter((g) => {
        if (g.company.toLowerCase().includes(q)) return true;
        if (
          g.targets.some(
            (t) =>
              `${t.firstname} ${t.lastname || ""}`.toLowerCase().includes(q) ||
              t.email.toLowerCase().includes(q)
          )
        )
          return true;
        return g.pending.some(
          (c) =>
            `${c.prenom || ""} ${c.nom || ""}`.toLowerCase().includes(q) ||
            (c.email || "").toLowerCase().includes(q)
        );
      });
    }

    // Métriques d'engagement agrégées par marque (sur le dernier mail de chaque contact).
    const metrics = (g: { targets: Target[] }) => {
      let opens = 0;
      let clicks = 0;
      let lastOpen = 0;
      for (const t of g.targets) {
        const latest = t.touches[0];
        if (!latest) continue;
        opens += latest.openCount || 0;
        clicks += latest.clickCount || 0;
        if (latest.lastOpenAt) {
          const ts = new Date(latest.lastOpenAt).getTime();
          if (ts > lastOpen) lastOpen = ts;
        }
      }
      return { opens, clicks, lastOpen };
    };

    if (sortBy === "notOpened") {
      groups = groups.filter((g) => metrics(g).opens === 0 && g.targets.length > 0);
    } else if (sortBy === "opens") {
      groups.sort((a, b) => metrics(b).opens - metrics(a).opens);
    } else if (sortBy === "clicks") {
      groups.sort((a, b) => metrics(b).clicks - metrics(a).clicks);
    } else if (sortBy === "lastOpen") {
      groups.sort((a, b) => metrics(b).lastOpen - metrics(a).lastOpen);
    }

    return groups;
  }, [visibleTargets, pendingContacts, activeTab, searchTerm, sortBy]);

  const toggleExpand = useCallback(
    async (target: Target) => {
      if (expandedId === target.id) {
        setExpandedId(null);
        setExpandedTouches([]);
        return;
      }
      setExpandedId(target.id);
      setExpandedTouches([]);
      setExpandedLoading(true);
      try {
        const res = await fetch(`/api/outreach/targets/${target.id}`);
        const data = await res.json();
        if (res.ok) setExpandedTouches(data.target?.touches || []);
      } finally {
        setExpandedLoading(false);
      }
    },
    [expandedId]
  );

  const handleStopResume = useCallback(
    async (target: Target, action: "stop" | "resume") => {
      const confirmMsg =
        action === "stop"
          ? `Sortir ${target.firstname} (${target.company}) du cycle de recontact ?`
          : `Remettre ${target.firstname} (${target.company}) dans le cycle ?`;
      if (!window.confirm(confirmMsg)) return;
      setActionBusy(target.id);
      try {
        const res = await fetch(`/api/outreach/targets/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur");
        flash("success", action === "stop" ? "Client sorti du cycle." : "Client remis dans le cycle.");
        await loadTargets();
      } catch (e) {
        flash("error", e instanceof Error ? e.message : "Erreur");
      } finally {
        setActionBusy(null);
      }
    },
    [flash, loadTargets]
  );

  const handleDelete = useCallback(
    async (target: Target) => {
      if (!window.confirm(`Supprimer définitivement ${target.firstname} (${target.company}) et son historique ?`))
        return;
      setActionBusy(target.id);
      try {
        const res = await fetch(`/api/outreach/targets/${target.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erreur");
        }
        flash("success", "Client supprimé.");
        await loadTargets();
      } catch (e) {
        flash("error", e instanceof Error ? e.message : "Erreur");
      } finally {
        setActionBusy(null);
      }
    },
    [flash, loadTargets]
  );

  /**
   * Retire toute la marque du cycle Outreach (ajout par erreur) : supprime ses
   * contacts du cycle + ses contacts en attente issus de la carto. La fiche
   * marque reste dans le CRM. Admin uniquement.
   */
  const handleDeleteMarque = useCallback(
    async (group: { marqueId: string; company: string; targets: Target[]; pending: PendingContact[] }) => {
      const inCycle = group.targets.length;
      const waiting = group.pending.length;
      const detail = [
        inCycle > 0 ? `${inCycle} contact${inCycle > 1 ? "s" : ""} du cycle` : null,
        waiting > 0 ? `${waiting} contact${waiting > 1 ? "s" : ""} en attente` : null,
      ]
        .filter(Boolean)
        .join(" et ");
      if (
        !window.confirm(
          `Retirer ${group.company} de l'outreach ?\n\n${detail || "Aucun contact"} ` +
            `seront supprimés du cycle et leur historique effacé. La fiche marque reste dans le CRM.`
        )
      )
        return;
      setActionBusy(group.marqueId);
      try {
        const res = await fetch(`/api/outreach/marques/${group.marqueId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erreur");
        }
        flash("success", `${group.company} retirée de l'outreach.`);
        await Promise.all([loadTargets(), loadPendingContacts()]);
      } catch (e) {
        flash("error", e instanceof Error ? e.message : "Erreur");
      } finally {
        setActionBusy(null);
      }
    },
    [flash, loadTargets, loadPendingContacts]
  );

  /**
   * Contenu passé au composer (même composant que le pipeline talent).
   * Tous les contacts de la marque : un seul mail rédigé, envoyé
   * individuellement à chacun (variables personnalisées par contact).
   */
  const composerContact = useMemo(() => {
    if (!composerGroup) return null;
    const withDraft = composerGroup.targets.find((t) => t.draftSubject || t.draftBodyHtml);
    return {
      company: composerGroup.company,
      contacts: composerGroup.targets.map((t) => ({
        id: t.id,
        firstname: t.firstname,
        lastname: t.lastname || "",
        email: t.email,
      })),
      initialSubject: withDraft?.draftSubject || "",
      initialBodyHtml: withDraft?.draftBodyHtml || "",
      missionBrief: null,
    };
  }, [composerGroup]);

  /** Brouillon partagé : enregistré sur chaque contact du groupe. */
  const saveDraft = useCallback(
    async (targetIds: string[], subject: string, bodyHtml: string) => {
      await Promise.all(
        targetIds.map(async (targetId) => {
          const res = await fetch(`/api/outreach/targets/${targetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "draft", subject, bodyHtml }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Impossible d'enregistrer le brouillon.");
          }
        })
      );
    },
    []
  );

  const handleComposerSaved = useCallback(
    (
      status: "pret" | "en_cours" | "reset",
      draft?: { subject: string; bodyHtml: string; language?: "fr" | "en" }
    ) => {
      const group = composerGroup;
      if (!group) return;
      const ids = group.targets.map((t) => t.id);
      const sourceLanguage: "fr" | "en" = draft?.language === "en" ? "en" : "fr";
      const toTranslateCount = group.targets.filter(
        (t) => (t.language === "en" ? "en" : "fr") !== sourceLanguage
      ).length;

      void (async () => {
        try {
          if (status === "reset") {
            await saveDraft(ids, "", "");
            flash("success", "Brouillon effacé.");
            await loadTargets();
            return;
          }

          if (status === "en_cours") {
            await saveDraft(ids, draft?.subject || "", draft?.bodyHtml || "");
            await loadTargets();
            return;
          }

          // status === "pret" → confirmation puis envoi individuel à chacun
          const recipients = group.targets.map((t) => t.email).join(", ");
          const otherLangLabel = sourceLanguage === "fr" ? "anglais" : "français";
          const translateNote =
            toTranslateCount > 0
              ? `\n\n🌐 ${toTranslateCount} contact${
                  toTranslateCount > 1 ? "s" : ""
                } recevr${toTranslateCount > 1 ? "ont" : "a"} la version traduite automatiquement en ${otherLangLabel}.`
              : "";
          const confirmed = window.confirm(
            group.targets.length > 1
              ? `Envoyer ce mail aux ${group.targets.length} contacts de ${group.company} ?\n\n${recipients}\n\nChacun reçoit son propre mail personnalisé (thread et relances séparés).${translateNote}\n\nAnnuler = garder en brouillon.`
              : `Envoyer ce mail à ${recipients} depuis la boîte de Leyna ?${translateNote}\n\nAnnuler = garder en brouillon.`
          );
          await saveDraft(ids, draft?.subject || "", draft?.bodyHtml || "");
          if (!confirmed) {
            flash("success", "Brouillon enregistré (mail non envoyé).");
            await loadTargets();
            return;
          }

          const subjectToSend = draft?.subject || "";
          const bodyToSend = draft?.bodyHtml || "";

          // Barre de progression (traduction + envoi). On l'initialise dès le
          // départ pour donner un retour immédiat à l'utilisateur.
          const showProgress = group.targets.length > 1 || toTranslateCount > 0;
          if (showProgress) {
            setSendProgress({
              done: 0,
              total: ids.length,
              label: "Préparation de l'envoi…",
            });
          }

          let data: BulkSendResult;
          try {
            data = await sendBulkStreaming(
              {
                targetIds: ids,
                subject: subjectToSend,
                bodyHtml: bodyToSend,
                sourceLanguage,
              },
              (p) => {
                if (showProgress) setSendProgress(p);
              }
            );
          } finally {
            setSendProgress(null);
          }

          const failed: { email: string; error: string }[] = data.failed || [];
          const needsConfirmation: {
            targetId: string;
            email: string;
            message: string;
            suggestedNextRecontactAt?: string;
          }[] = data.needsConfirmation || [];

          if (data.sent > 0) {
            const translatedNote =
              data.translated > 0
                ? ` · ${data.translated} traduit${data.translated > 1 ? "s" : ""} auto`
                : "";
            flash(
              "success",
              `${data.sent} mail${data.sent > 1 ? "s" : ""} envoyé${data.sent > 1 ? "s" : ""} (${group.company}) — compteur 45 jours relancé${translatedNote}${
                failed.length > 0 ? ` · ${failed.length} échec${failed.length > 1 ? "s" : ""}` : ""
              }.`
            );
          }
          if (data.translationFailed) {
            flash(
              "error",
              `⚠️ Traduction automatique en ${
                data.translationFailed === "en" ? "anglais" : "français"
              } indisponible : ces contacts ont reçu la version d'origine. Vérifie et renvoie si besoin.`
            );
          }
          if (failed.length > 0 && data.sent === 0) {
            flash("error", failed.map((f) => `${f.email} : ${f.error}`).join(" | "));
          }

          // Clients déjà contactés (pipeline talent ou hors app) : on laisse
          // l'utilisateur choisir — envoyer quand même, ou mettre en attente.
          if (needsConfirmation.length > 0) {
            const fmtDate = (iso?: string) =>
              iso
                ? new Date(iso).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : null;
            const lines = needsConfirmation
              .map((c) => {
                const next = fmtDate(c.suggestedNextRecontactAt);
                return next
                  ? `• ${c.email} — ${c.message}\n  Mise en attente → recontact le ${next}.`
                  : `• ${c.email} — ${c.message}`;
              })
              .join("\n");
            const sendAnyway = window.confirm(
              `${needsConfirmation.length} client${needsConfirmation.length > 1 ? "s ont" : " a"} déjà été contacté${
                needsConfirmation.length > 1 ? "s" : ""
              } récemment :\n\n${lines}\n\n` +
                `OK = Envoyer quand même maintenant\n` +
                `Annuler = Mettre en attente (recontact reprogrammé)`
            );

            const confirmIds = needsConfirmation.map((c) => c.targetId);
            if (sendAnyway) {
              const showForceProgress = confirmIds.length > 1;
              if (showForceProgress) {
                setSendProgress({
                  done: 0,
                  total: confirmIds.length,
                  label: "Préparation de l'envoi…",
                });
              }
              let forceData: BulkSendResult;
              try {
                forceData = await sendBulkStreaming(
                  {
                    targetIds: confirmIds,
                    subject: subjectToSend,
                    bodyHtml: bodyToSend,
                    sourceLanguage,
                    force: true,
                  },
                  (p) => {
                    if (showForceProgress) setSendProgress(p);
                  }
                );
              } finally {
                setSendProgress(null);
              }
              const forceFailed: { email: string; error: string }[] =
                forceData.failed || [];
              if (forceData.sent > 0) {
                flash(
                  "success",
                  `${forceData.sent} mail${forceData.sent > 1 ? "s" : ""} envoyé${
                    forceData.sent > 1 ? "s" : ""
                  } malgré un contact récent — compteur 45 jours relancé.`
                );
              }
              if (forceFailed.length > 0) {
                flash(
                  "error",
                  forceFailed.map((f) => `${f.email} : ${f.error}`).join(" | ")
                );
              }
            } else {
              const resWait = await fetch("/api/outreach/reschedule-bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetIds: confirmIds }),
              });
              const waitData = await resWait.json();
              if (!resWait.ok) throw new Error(waitData.error || "Erreur");
              flash(
                "success",
                waitData.rescheduled === 1 && waitData.message
                  ? waitData.message
                  : `${waitData.rescheduled || 0} client(s) mis en attente (recontact reprogrammé).`
              );
            }
          }

          await loadTargets();
        } catch (e) {
          flash("error", e instanceof Error ? e.message : "Erreur");
        }
      })();
    },
    [composerGroup, saveDraft, flash, loadTargets]
  );

  /**
   * Vérification rétroactive des bounces sur tous les mails déjà envoyés :
   * supprime les contacts dont l'adresse n'existe pas (mail revenu en erreur)
   * et corrige les fausses « réponses » (relance auto / postmaster).
   */
  const handleCheckBounces = useCallback(async () => {
    if (
      !window.confirm(
        "Vérifier tous les mails déjà envoyés ?\n\nLes contacts dont l'adresse n'existe pas (mail revenu en erreur) seront supprimés du cycle automatiquement."
      )
    )
      return;
    setCheckingBounces(true);
    try {
      const res = await fetch("/api/outreach/check-bounces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Vérification impossible.");
      const bounces: { name: string; company: string }[] = data.bounces || [];
      const falseReplies: unknown[] = data.falseReplies || [];
      if (bounces.length === 0 && falseReplies.length === 0) {
        flash("success", `${data.scanned} contact(s) vérifiés : aucune adresse invalide détectée.`);
      } else {
        const detail = bounces.map((b) => `${b.name} (${b.company})`).join(", ");
        flash(
          "success",
          `${data.scanned} contact(s) vérifiés — ${bounces.length} adresse(s) invalide(s) supprimée(s)${
            detail ? ` : ${detail}` : ""
          }${falseReplies.length > 0 ? ` — ${falseReplies.length} fausse(s) réponse(s) corrigée(s)` : ""}.`
        );
      }
      loadTargets();
    } catch (e: unknown) {
      flash("error", e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setCheckingBounces(false);
    }
  }, [flash, loadTargets]);

  const handleRelanceNow = useCallback(
    async (target: Target) => {
      if (
        !window.confirm(
          `Envoyer la relance maintenant dans le thread du dernier mail à ${target.email} ?\n\nLa relance automatique J+3 ne partira pas (une seule relance par mail).`
        )
      )
        return;
      setActionBusy(target.id);
      try {
        const res = await fetch(`/api/outreach/targets/${target.id}/relance-now`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur");
        flash("success", "Relance envoyée.");
        await loadTargets();
      } catch (e) {
        flash("error", e instanceof Error ? e.message : "Erreur");
      } finally {
        setActionBusy(null);
      }
    },
    [flash, loadTargets]
  );

  /** Contact de carto : on note son email → il entre dans le cycle. */
  const handleAddPendingToCycle = useCallback(
    async (contact: PendingContact, email: string) => {
      setActionBusy(contact.id);
      try {
        const res = await fetch("/api/outreach/targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marqueContactId: contact.id, email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur");
        flash(
          "success",
          `${contact.prenom || contact.nom} (${contact.company}) entre dans le cycle — email enregistré sur la fiche marque.`
        );
        await Promise.all([loadTargets(), loadPendingContacts()]);
      } catch (e) {
        flash("error", e instanceof Error ? e.message : "Erreur");
      } finally {
        setActionBusy(null);
      }
    },
    [flash, loadTargets, loadPendingContacts]
  );

  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
      </div>
    );
  }

  if (sessionStatus === "authenticated" && !ALLOWED.includes(role)) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Vous n&apos;avez pas accès à ce module.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: LICORICE }}>
            <Repeat className="w-6 h-6" style={{ color: OLD_ROSE }} />
            Outreach Clients
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cycle de contact 45 jours — premier mail, relance auto J+3, puis recontact en boucle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckBounces}
            disabled={checkingBounces}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: "#E5E0DA", color: LICORICE }}
            title="Vérifie les threads Gmail des mails déjà envoyés : supprime les contacts dont l'adresse n'existe pas (mail revenu en erreur)"
          >
            {checkingBounces ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MailWarning className="w-4 h-4" style={{ color: "#C2410C" }} />
            )}
            Vérifier les bounces
          </button>
          <button
            onClick={() => setShowCartoModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition hover:bg-gray-50"
            style={{ borderColor: "#E5E0DA", color: LICORICE }}
            title="Coller une cartographie de contacts (fichier Claude / Excel)"
          >
            <FileSpreadsheet className="w-4 h-4" style={{ color: "#3D8B40" }} />
            Importer une carto
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: LICORICE }}
          >
            <Plus className="w-4 h-4" />
            Ajouter un client
          </button>
        </div>
      </div>

      {/* Flash messages */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg border text-sm" style={{ backgroundColor: "#F4FBE8", borderColor: TEA_GREEN, color: LICORICE }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#6B9B37" }} />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TAB_DEFS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2 rounded-full text-sm font-medium transition border"
              style={
                active
                  ? { backgroundColor: LICORICE, color: "white", borderColor: LICORICE }
                  : { backgroundColor: "white", color: LICORICE, borderColor: "#E5E0DA" }
              }
            >
              {tab.label}
              <span
                className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold"
                style={
                  active
                    ? { backgroundColor: TEA_GREEN, color: LICORICE }
                    : { backgroundColor: OLD_LACE, color: LICORICE }
                }
              >
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Barre recherche + tri */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher une marque, un contact, un email…"
            className="w-full pl-9 pr-8 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "#E5E0DA" }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-700"
              title="Effacer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="py-2 pl-3 pr-8 rounded-lg border text-sm font-medium cursor-pointer focus:outline-none focus:ring-2"
            style={{ borderColor: "#E5E0DA", color: LICORICE }}
            title="Trier les marques par engagement"
          >
            {SORT_DEFS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed" style={{ borderColor: "#E5E0DA", backgroundColor: "#FBF8F4" }}>
          <Mail className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            {searchTerm.trim()
              ? `Aucun résultat pour « ${searchTerm.trim()} ».`
              : sortBy === "notOpened"
              ? "Tous les clients de cette file ont ouvert leur dernier mail."
              : activeTab === "TO_CONTACT"
              ? "Aucun nouveau client à contacter. Ajoute un client pour démarrer."
              : activeTab === "WAITING"
              ? "Aucun client en attente."
              : activeTab === "TO_RECONTACT"
              ? "Aucun client à recontacter pour l'instant."
              : "Aucun client stoppé."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => {
            const groupBusy =
              group.targets.some((t) => actionBusy === t.id) || actionBusy === group.marqueId;
            const canCompose = activeTab !== "STOPPED";
            const groupLangs = [
              ...group.targets.map((t) => (t.language === "en" ? "en" : "fr")),
              ...group.pending.map((c) => (c.language === "en" ? "en" : "fr")),
            ];
            const hasEnglish = groupLangs.includes("en");
            const hasFrench = groupLangs.includes("fr");
            const langKind: "fr" | "en" | "mixed" | null =
              groupLangs.length === 0
                ? null
                : hasEnglish && hasFrench
                ? "mixed"
                : hasEnglish
                ? "en"
                : "fr";
            return (
              <div
                key={group.marqueId}
                className="rounded-xl border bg-white overflow-hidden"
                style={{ borderColor: "#E5E0DA" }}
              >
                {/* En-tête marque : un seul mail pour tous ses contacts */}
                <div
                  className="px-4 py-3 flex flex-wrap items-center gap-3 border-b"
                  style={{ backgroundColor: "#FBF8F4", borderColor: "#F0EBE4" }}
                >
                  <div className="flex-1 min-w-[180px] flex items-center gap-1.5">
                    <a
                      href={`/marques/${group.marqueId}`}
                      className="font-semibold text-sm hover:underline inline-flex items-center gap-1.5"
                      style={{ color: LICORICE }}
                      title="Ouvrir la fiche marque (carto et contacts visibles par toute l'équipe)"
                    >
                      {group.company}
                      <ExternalLink className="w-3 h-3 text-gray-400" />
                    </a>
                    {langKind === "fr" && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: OLD_LACE, color: LICORICE }}
                        title="Client francophone : mail et relance auto en français"
                      >
                        🇫🇷 FR
                      </span>
                    )}
                    {langKind === "en" && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: "#1E3A8A", color: "#FFFFFF" }}
                        title="Client anglophone : mail et relance auto en anglais"
                      >
                        🇬🇧 EN
                      </span>
                    )}
                    {langKind === "mixed" && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: "#1E3A8A", color: "#FFFFFF" }}
                        title="Contacts mixtes : chacun reçoit sa langue (traduction auto à l'envoi)"
                      >
                        🇫🇷🇬🇧 FR + EN
                      </span>
                    )}
                    <span className="ml-1 text-xs text-gray-400">
                      {group.targets.length > 0 &&
                        `${group.targets.length} contact${group.targets.length > 1 ? "s" : ""}`}
                      {group.targets.length > 0 && group.pending.length > 0 && " · "}
                      {group.pending.length > 0 &&
                        `${group.pending.length} en attente d'email`}
                    </span>
                  </div>
                  {canCompose && group.targets.length > 0 && (
                    <button
                      onClick={() => setComposerGroup(group)}
                      disabled={groupBusy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: LICORICE }}
                      title={
                        group.targets.length > 1
                          ? "Un seul mail rédigé, envoyé individuellement à chaque contact"
                          : undefined
                      }
                    >
                      <Send className="w-3.5 h-3.5" />
                      {activeTab === "TO_CONTACT" ? "Rédiger le mail" : "Nouveau mail"}
                      {group.targets.length > 1 && ` (${group.targets.length})`}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteMarque(group)}
                      disabled={groupBusy}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                      title="Retirer cette marque de l'outreach (admin) — ajout par erreur"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Retirer
                    </button>
                  )}
                </div>

                {/* Contacts de la marque */}
                {group.targets.map((target) => {
                  const latest = target.touches[0] || null;
                  const days = daysUntil(target.nextRecontactAt);
                  const expanded = expandedId === target.id;
                  const busy = actionBusy === target.id;
                  // Relance auto J+3 ouvrés : prévue tant qu'elle n'est pas
                  // partie et que le client n'a pas répondu sur ce mail.
                  const relancePlannedAt =
                    target.status === "WAITING" &&
                    latest?.sentAt &&
                    !latest.relanceSentAt &&
                    !latest.repliedAt
                      ? businessDaysAfter(new Date(latest.sentAt), RELANCE_BUSINESS_DAYS)
                      : null;
                  const relanceDays = relancePlannedAt
                    ? daysUntil(relancePlannedAt.toISOString())
                    : null;
                  return (
                    <div key={target.id} className="border-b last:border-b-0" style={{ borderColor: "#F5F1EB" }}>
                      <div className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                        {/* Identité */}
                        <div className="min-w-[200px] flex-1">
                          <div className="font-medium text-sm flex items-center gap-1.5" style={{ color: LICORICE }}>
                            {target.firstname} {target.lastname || ""}
                            {langKind === "mixed" && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                                style={{ backgroundColor: OLD_LACE, color: LICORICE }}
                                title={
                                  target.language === "en"
                                    ? "Ce contact reçoit le mail en anglais"
                                    : "Ce contact reçoit le mail en français"
                                }
                              >
                                {target.language === "en" ? "🇬🇧 EN" : "🇫🇷 FR"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{target.email}</div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {target.fromEmail &&
                            target.fromEmail.toLowerCase() !== DEFAULT_SENDER_EMAIL && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: "#EEF2FF", color: "#4338CA" }}
                                title={`Cycle envoyé depuis ${target.fromEmail}`}
                              >
                                <Mail className="w-3 h-3" />
                                {senderLabel(senderAccounts, target.fromEmail)}
                              </span>
                            )}
                          {target.cycleCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: OLD_LACE, color: LICORICE }}>
                              Cycle {target.cycleCount}
                            </span>
                          )}
                          {target.draftSubject && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#FDF1F1", color: "#A85B5B" }}>
                              <PenLine className="w-3 h-3" />
                              Brouillon
                            </span>
                          )}
                          {target.status === "WAITING" && days !== null && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#FFF7E8", color: "#8A6D1A" }}>
                              <Clock className="w-3 h-3" />
                              {days <= 0 ? "Recontact imminent" : `Recontact dans ${days}j`}
                            </span>
                          )}
                          {target.autoRescheduleReason && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: "#FFF1E6", color: "#B45309" }}
                              title={target.autoRescheduleReason}
                            >
                              <MailWarning className="w-3 h-3" />
                              Déjà contacté hors app
                            </span>
                          )}
                          {target.lastRepliedAt && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: TEA_GREEN, color: LICORICE }}>
                              <MessageSquareReply className="w-3 h-3" />
                              A répondu
                            </span>
                          )}
                          {relancePlannedAt && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: "#FDF1F1", color: "#A85B5B" }}
                              title={`Relance automatique J+3 ouvrés prévue le ${formatDate(
                                relancePlannedAt.toISOString()
                              )}`}
                            >
                              <Repeat className="w-3 h-3" />
                              {relanceDays !== null && relanceDays <= 0
                                ? "Relance auto imminente"
                                : `Relance auto le ${formatDate(relancePlannedAt.toISOString())}`}
                            </span>
                          )}
                          {latest?.relanceSentAt && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium"
                              title={`Relance envoyée le ${formatDate(latest.relanceSentAt)} — pas d'autre relance sur ce mail`}
                            >
                              <Repeat className="w-3 h-3" />
                              Relancé le {formatDate(latest.relanceSentAt)}
                            </span>
                          )}
                          {latest && latest.openCount > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-gray-500"
                              title={
                                `Ouvert ${latest.openCount} fois\n` +
                                (latest.openedAt
                                  ? `1ère ouverture : ${formatDateTime(latest.openedAt)}\n`
                                  : "") +
                                (latest.lastOpenAt
                                  ? `Dernière : ${formatDateTime(latest.lastOpenAt)}`
                                  : "")
                              }
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {latest.openCount}
                              {latest.lastOpenAt && (
                                <span className="text-gray-400">
                                  · {timeAgo(latest.lastOpenAt)}
                                </span>
                              )}
                            </span>
                          )}
                          {latest && latest.clickCount > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-gray-500"
                              title={
                                `Cliqué ${latest.clickCount} fois` +
                                (latest.lastClickAt
                                  ? `\nDernier clic : ${formatDateTime(latest.lastClickAt)}`
                                  : "")
                              }
                            >
                              <MousePointerClick className="w-3.5 h-3.5" />
                              {latest.clickCount}
                            </span>
                          )}
                          {target.hubspotSyncedAt && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#EAF3FF", color: "#2563A8" }} title="Contact HubSpot mis à jour (app_last_contacted_at)">
                              <Cloud className="w-3 h-3" />
                              HubSpot
                            </span>
                          )}
                          {latest?.sendError && (
                            <span className="inline-flex items-center gap-1 text-red-600" title={latest.sendError}>
                              <AlertCircle className="w-3.5 h-3.5" />
                              Erreur envoi
                            </span>
                          )}
                        </div>

                        {/* Dates */}
                        <div className="text-xs text-gray-400 min-w-[120px]">
                          {target.lastSentAt ? `Dernier mail : ${formatDate(target.lastSentAt)}` : `Ajouté : ${formatDate(target.createdAt)}`}
                        </div>

                        {/* Actions contact */}
                        <div className="flex items-center gap-1.5 ml-auto">
                          {target.status === "WAITING" && latest && !latest.relanceSentAt && !latest.repliedAt && (
                            <button
                              onClick={() => handleRelanceNow(target)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:bg-gray-50 disabled:opacity-50"
                              style={{ borderColor: "#E5E0DA", color: LICORICE }}
                              title="Forcer la relance maintenant. La relance automatique J+3 est alors annulée (une seule relance par mail)."
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Relancer
                            </button>
                          )}
                          <button
                            onClick={() => setEditTarget(target)}
                            disabled={busy}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                            title="Modifier le client (nom, entreprise…)"
                          >
                            <PenLine className="w-4 h-4" />
                          </button>
                          {target.status !== "STOPPED" ? (
                            <button
                              onClick={() => handleStopResume(target, "stop")}
                              disabled={busy}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                              title="Sortir du cycle"
                            >
                              <StopCircle className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStopResume(target, "resume")}
                              disabled={busy}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-green-700 hover:bg-green-50 transition disabled:opacity-50"
                              title="Remettre dans le cycle"
                            >
                              <PlayCircle className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(target)}
                              disabled={busy}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                              title="Supprimer (admin)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {target.cycleCount > 0 && (
                            <button
                              onClick={() => toggleExpand(target)}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 transition"
                              title="Historique"
                            >
                              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Raison de replanification auto (déjà contacté hors app) */}
                      {target.autoRescheduleReason && (
                        <div className="px-4 pb-2 -mt-1">
                          <p
                            className="text-[11px] flex items-start gap-1"
                            style={{ color: "#B45309" }}
                          >
                            <MailWarning className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{target.autoRescheduleReason}</span>
                          </p>
                        </div>
                      )}

                      {/* Historique des touches */}
                      {expanded && (
                        <div className="border-t px-4 py-3" style={{ borderColor: "#F0EBE4", backgroundColor: "#FBF8F4" }}>
                          {expandedLoading ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Chargement de l&apos;historique…
                            </div>
                          ) : expandedTouches.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">Aucun mail envoyé.</p>
                          ) : (
                            <div className="space-y-2">
                              {expandedTouches.map((touch) => (
                                <div key={touch.id} className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: "#EDE7DF" }}>
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold" style={{ color: LICORICE }}>
                                      Cycle {touch.cycleNumber}
                                    </span>
                                    <span className="text-gray-500 truncate max-w-[320px]" title={touch.subject}>
                                      {touch.subject}
                                    </span>
                                    <span className="text-gray-400">{formatDate(touch.sentAt)}</span>
                                    {touch.relanceSentAt && (
                                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                        Relance : {formatDate(touch.relanceSentAt)}
                                      </span>
                                    )}
                                    {touch.repliedAt && (
                                      <span className="px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: TEA_GREEN, color: LICORICE }}>
                                        Réponse : {formatDate(touch.repliedAt)}
                                      </span>
                                    )}
                                    <span
                                      className="inline-flex items-center gap-1 text-gray-400 ml-auto"
                                      title={
                                        touch.lastOpenAt
                                          ? `Dernière ouverture : ${formatDateTime(touch.lastOpenAt)}`
                                          : undefined
                                      }
                                    >
                                      <Eye className="w-3 h-3" /> {touch.openCount}
                                      <MousePointerClick className="w-3 h-3 ml-2" /> {touch.clickCount}
                                    </span>
                                  </div>
                                  {touch.openCount > 0 && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                                      <span className="inline-flex items-center gap-1">
                                        <Eye className="w-3 h-3" style={{ color: OLD_ROSE }} />
                                        {touch.openCount} ouverture{touch.openCount > 1 ? "s" : ""}
                                      </span>
                                      {touch.openedAt && (
                                        <span>1ère : {formatDateTime(touch.openedAt)}</span>
                                      )}
                                      {touch.lastOpenAt &&
                                        touch.lastOpenAt !== touch.openedAt && (
                                          <span>
                                            Dernière : {formatDateTime(touch.lastOpenAt)}{" "}
                                            <span className="text-gray-400">
                                              ({timeAgo(touch.lastOpenAt)})
                                            </span>
                                          </span>
                                        )}
                                    </div>
                                  )}
                                  {touch.clicks && touch.clicks.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                      <span className="text-[11px] text-gray-400">Liens cliqués :</span>
                                      {groupClicks(touch.clicks).map((c) => (
                                        <a
                                          key={c.url}
                                          href={c.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          title={`${c.count} clic${c.count > 1 ? "s" : ""} — dernier le ${formatDate(c.lastAt)}\n${c.url}`}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium hover:bg-gray-50 transition"
                                          style={{ borderColor: "#EDE7DF", color: LICORICE, backgroundColor: OLD_LACE }}
                                        >
                                          <MousePointerClick className="w-3 h-3" style={{ color: OLD_ROSE }} />
                                          {c.label}
                                          {c.count > 1 && <span className="text-gray-400">×{c.count}</span>}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  {touch.sendError && (
                                    <p className="text-xs text-red-600 mt-1">{touch.sendError}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Contacts de la carto en attente d'email */}
                {group.pending.length > 0 && (
                  <div style={{ backgroundColor: "#FCFBF8" }}>
                    <div className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: "#3D8B40" }} />
                      Carto importée — note l&apos;email pour lancer le contact
                    </div>
                    {group.pending.map((contact) => (
                      <PendingContactRow
                        key={contact.id}
                        contact={contact}
                        busy={actionBusy === contact.id}
                        onAdd={(email) => handleAddPendingToCycle(contact, email)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddClientModal
          senderAccounts={senderAccounts}
          allowSenderChoice={isAdmin}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            setActiveTab("TO_CONTACT");
            flash("success", "Client ajouté à la file « À contacter ».");
            loadTargets();
          }}
          onError={(m) => flash("error", m)}
        />
      )}
      {showCartoModal && (
        <ImportCartoModal
          onClose={() => setShowCartoModal(false)}
          onImported={(company, created, skippedCount, addedToCycle) => {
            setShowCartoModal(false);
            setActiveTab("TO_CONTACT");
            const waiting = created - addedToCycle;
            flash(
              "success",
              `Carto ${company} : ${created} contact${created > 1 ? "s" : ""} sur la fiche marque — ${addedToCycle} dans « À contacter »${
                waiting > 0 ? `, ${waiting} en attente d'email` : ""
              }${skippedCount > 0 ? ` (${skippedCount} déjà connu${skippedCount > 1 ? "s" : ""})` : ""}.`
            );
            loadPendingContacts();
            loadTargets();
          }}
          onError={(m) => flash("error", m)}
        />
      )}
      {editTarget && (
        <EditClientModal
          target={editTarget}
          senderAccounts={senderAccounts}
          allowSenderChoice={isAdmin}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            flash("success", "Client mis à jour.");
            loadTargets();
          }}
          onError={(m) => flash("error", m)}
        />
      )}
      <CastingComposer
        open={Boolean(composerGroup)}
        contact={composerContact}
        brandColumn={"todo"}
        useHubspot={false}
        readyLabel={`Envoyer depuis ${senderLabel(
          senderAccounts,
          composerGroup?.targets[0]?.fromEmail ?? null
        )}`}
        defaultLanguage={
          composerGroup && composerGroup.targets.every((t) => t.language === "en")
            ? "en"
            : "fr"
        }
        onClose={() => setComposerGroup(null)}
        onSaved={handleComposerSaved}
        onError={(m) => flash("error", m)}
        onSuccess={() => {}}
      />
      {sendProgress && (
        <SendProgressOverlay progress={sendProgress} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlay : progression d'un envoi groupé (traduction + envoi)        */
/* ------------------------------------------------------------------ */

function SendProgressOverlay({
  progress,
}: {
  progress: { done: number; total: number; label: string };
}) {
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        style={{ border: `1px solid ${OLD_ROSE}33` }}
      >
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: OLD_ROSE }} />
          <h3 className="text-base font-semibold" style={{ color: LICORICE }}>
            Envoi en cours…
          </h3>
        </div>
        <p className="mt-2 text-sm text-gray-600 truncate" title={progress.label}>
          {progress.label || "Préparation…"}
        </p>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: OLD_ROSE,
            }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>
            {progress.done} / {progress.total}
          </span>
          <span>{pct}%</span>
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          Ne ferme pas cette fenêtre pendant l&apos;envoi.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal : ajout d'un client                                           */
/* ------------------------------------------------------------------ */

type MarqueOption = {
  id: string;
  nom: string;
  secteur: string | null;
  ville: string | null;
  contacts: {
    id: string;
    prenom: string | null;
    nom: string;
    email: string | null;
    poste: string | null;
    principal: boolean;
  }[];
  _count: { collaborations: number; outreachTargets: number };
};

type ContactOption = {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  poste: string | null;
  principal: boolean;
  marque: MarqueOption;
  outreachStatus: TargetStatus | null;
};

function AddClientModal({
  senderAccounts,
  allowSenderChoice,
  onClose,
  onAdded,
  onError,
}: {
  senderAccounts: SenderAccount[];
  /** Choix de la boîte d'envoi réservé à l'ADMIN — sinon tout part de Leyna. */
  allowSenderChoice: boolean;
  onClose: () => void;
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  // Étape 1 : la boîte ou la personne (recherche CRM unifiée, ou création)
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MarqueOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMarque, setSelectedMarque] = useState<MarqueOption | null>(null);
  const [createMode, setCreateMode] = useState(false);

  // Étape 2 : le contact
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [poste, setPoste] = useState("");
  const [language, setLanguage] = useState<"fr" | "en" | null>(null);
  const [fromEmail, setFromEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Recherche débouncée dans le CRM (marques + personnes)
  useEffect(() => {
    if (selectedMarque || createMode) return;
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      setContactOptions([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/outreach/marques?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (res.ok) {
          setOptions(data.marques || []);
          setContactOptions(data.contacts || []);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selectedMarque, createMode]);

  const pickContact = (c: MarqueOption["contacts"][number]) => {
    setSelectedContactId(c.id);
    setFirstname(c.prenom || "");
    setLastname(c.prenom ? c.nom : "");
    setEmail(c.email || "");
    setPoste(c.poste || "");
  };

  const clearContact = () => {
    setSelectedContactId(null);
    setFirstname("");
    setLastname("");
    setEmail("");
    setPoste("");
  };

  const resetMarque = () => {
    setSelectedMarque(null);
    setCreateMode(false);
    setQuery("");
    setOptions([]);
    setContactOptions([]);
    clearContact();
  };

  /** Résultat « personne » : sélectionne sa marque + pré-remplit le contact */
  const pickContactOption = (c: ContactOption) => {
    setSelectedMarque(c.marque);
    setOptions([]);
    setContactOptions([]);
    pickContact(c);
  };

  const companyChosen = Boolean(selectedMarque) || (createMode && query.trim());
  const canSubmit =
    companyChosen && firstname.trim() && email.trim() && language !== null && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/outreach/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marqueId: selectedMarque?.id || undefined,
          company: selectedMarque ? undefined : query.trim(),
          firstname,
          lastname,
          email,
          poste,
          language,
          fromEmail: allowSenderChoice ? fromEmail || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onAdded();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl" style={{ borderColor: "#F0EBE4" }}>
          <h2 className="font-semibold" style={{ color: LICORICE }}>
            Nouveau client
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ---------- Étape 1 : la boîte ---------- */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
              1. La boîte
            </label>

            {selectedMarque ? (
              <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: TEA_GREEN, backgroundColor: "#F8FCEF" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {selectedMarque.nom}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[selectedMarque.secteur, selectedMarque.ville].filter(Boolean).join(" · ") || "Fiche CRM existante"}
                    {selectedMarque._count.collaborations > 0 &&
                      ` · ${selectedMarque._count.collaborations} collab${selectedMarque._count.collaborations > 1 ? "s" : ""}`}
                  </div>
                </div>
                <button onClick={resetMarque} className="text-xs text-gray-500 hover:text-gray-800 underline">
                  Changer
                </button>
              </div>
            ) : createMode ? (
              <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "#E5E0DA", backgroundColor: "#FBF8F4" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {query.trim() || "—"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Nouvelle marque — sera créée dans le CRM
                  </div>
                </div>
                <button onClick={resetMarque} className="text-xs text-gray-500 hover:text-gray-800 underline">
                  Changer
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: "#E5E0DA" }}
                  placeholder="Rechercher une marque ou une personne… (ex. Nike, Marie, marie@nike.com)"
                />
                {searching && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-2.5 text-gray-300" />
                )}
                {query.trim().length >= 2 && (
                  <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: "#EDE7DF" }}>
                    {options.length > 0 && (
                      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50">
                        Marques
                      </div>
                    )}
                    {options.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedMarque(m);
                          setOptions([]);
                          setContactOptions([]);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition flex items-center justify-between gap-2 border-t"
                        style={{ borderColor: "#F5F1EB" }}
                      >
                        <div>
                          <div className="text-sm font-medium" style={{ color: LICORICE }}>
                            {m.nom}
                          </div>
                          <div className="text-xs text-gray-400">
                            {[m.secteur, m.ville].filter(Boolean).join(" · ") || "—"}
                            {m.contacts.length > 0 &&
                              ` · ${m.contacts.length} contact${m.contacts.length > 1 ? "s" : ""}`}
                          </div>
                        </div>
                        {m._count.outreachTargets > 0 && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: OLD_LACE, color: LICORICE }}>
                            Déjà en cycle
                          </span>
                        )}
                      </button>
                    ))}
                    {contactOptions.length > 0 && (
                      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50">
                        Personnes
                      </div>
                    )}
                    {contactOptions.map((c) => {
                      const alreadyTracked = Boolean(c.outreachStatus);
                      return (
                        <button
                          key={c.id}
                          onClick={() => !alreadyTracked && pickContactOption(c)}
                          disabled={alreadyTracked}
                          className="w-full text-left px-4 py-2.5 transition flex items-center justify-between gap-2 border-t disabled:cursor-not-allowed disabled:opacity-60 hover:bg-gray-50"
                          style={{ borderColor: "#F5F1EB" }}
                          title={alreadyTracked ? "Ce contact est déjà suivi dans le cycle Outreach" : undefined}
                        >
                          <div>
                            <div className="text-sm font-medium" style={{ color: LICORICE }}>
                              {[c.prenom, c.prenom ? c.nom : null].filter(Boolean).join(" ") || c.nom}
                              <span className="ml-2 font-normal" style={{ color: OLD_ROSE }}>
                                {c.marque.nom}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400">
                              {[c.email, c.poste].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                          {alreadyTracked && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: OLD_LACE, color: LICORICE }}>
                              Déjà en cycle
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {!searching && options.length === 0 && contactOptions.length === 0 && (
                      <div className="px-4 py-2.5 text-xs text-gray-400 border-t" style={{ borderColor: "#F5F1EB" }}>
                        Aucun résultat dans le CRM pour « {query.trim()} »
                      </div>
                    )}
                    <button
                      onClick={() => setCreateMode(true)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition text-sm flex items-center gap-2 border-t"
                      style={{ color: OLD_ROSE, borderColor: "#F5F1EB" }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Créer la marque « {query.trim()} »
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---------- Étape 2 : le contact ---------- */}
          {companyChosen && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
                2. Le contact
              </label>

              {/* Contacts existants de la fiche CRM */}
              {selectedMarque && selectedMarque.contacts.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5">
                    Contacts déjà dans le CRM — clique pour pré-remplir :
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMarque.contacts.map((c) => {
                      const active = selectedContactId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => (active ? clearContact() : pickContact(c))}
                          className="px-2.5 py-1.5 rounded-lg border text-xs text-left transition"
                          style={
                            active
                              ? { borderColor: LICORICE, backgroundColor: LICORICE, color: "white" }
                              : { borderColor: "#E5E0DA", backgroundColor: "white", color: LICORICE }
                          }
                        >
                          <span className="font-medium">
                            {[c.prenom, c.prenom ? c.nom : null].filter(Boolean).join(" ") || c.nom}
                          </span>
                          {c.principal && <span className="ml-1">★</span>}
                          {c.email && (
                            <span className={active ? "block opacity-80" : "block text-gray-400"}>
                              {c.email}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
                  <input
                    value={firstname}
                    onChange={(e) => setFirstname(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "#E5E0DA" }}
                    placeholder="Marie"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
                  <input
                    value={lastname}
                    onChange={(e) => setLastname(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "#E5E0DA" }}
                    placeholder="Dupont"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "#E5E0DA" }}
                    placeholder="marie@nike.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Poste</label>
                  <input
                    value={poste}
                    onChange={(e) => setPoste(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "#E5E0DA" }}
                    placeholder="Responsable influence"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Langue du client <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-1.5">
                  {(["fr", "en"] as const).map((lang) => {
                    const active = language === lang;
                    return (
                      <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium transition"
                        style={
                          active
                            ? { borderColor: LICORICE, backgroundColor: LICORICE, color: "white" }
                            : { borderColor: "#E5E0DA", backgroundColor: "white", color: LICORICE }
                        }
                      >
                        {lang === "fr" ? "Français" : "English"}
                      </button>
                    );
                  })}
                </div>
                {language === null ? (
                  <p className="text-xs mt-1" style={{ color: OLD_ROSE }}>
                    Choix obligatoire : indique si le client parle français ou anglais.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    Le mail et la relance auto J+3 partiront dans cette langue.
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Un nouveau contact est ajouté à la fiche marque s&apos;il n&apos;existe pas déjà (dédoublonnage par email).
              </p>

              {/* ---------- Étape 3 : la boîte d'envoi (ADMIN uniquement) ---------- */}
              {allowSenderChoice && senderAccounts.length > 1 && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
                    3. Boîte d&apos;envoi
                  </label>
                  <select
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "#E5E0DA" }}
                  >
                    <option value="">Leyna (par défaut) — {DEFAULT_SENDER_EMAIL}</option>
                    {senderAccounts
                      .filter((a) => a.email.toLowerCase() !== DEFAULT_SENDER_EMAIL)
                      .map((a) => (
                        <option key={a.email} value={a.email}>
                          {a.label} — {a.email}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Tout le cycle de ce client (mails, relances, détection de réponses)
                    partira de cette boîte.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white rounded-b-2xl" style={{ borderColor: "#F0EBE4" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: LICORICE }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Ajouter au cycle
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal : édition d'un client (nom, entreprise…)                      */
/* ------------------------------------------------------------------ */

function EditClientModal({
  target,
  senderAccounts,
  allowSenderChoice,
  onClose,
  onSaved,
  onError,
}: {
  target: Target;
  senderAccounts: SenderAccount[];
  /** Choix de la boîte d'envoi réservé à l'ADMIN — sinon tout part de Leyna. */
  allowSenderChoice: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [firstname, setFirstname] = useState(target.firstname);
  const [lastname, setLastname] = useState(target.lastname || "");
  const [email, setEmail] = useState(target.email);
  const [company, setCompany] = useState(target.company);
  const [language, setLanguage] = useState<"fr" | "en">(
    target.language === "en" ? "en" : "fr"
  );
  const [fromEmail, setFromEmail] = useState(
    (target.fromEmail || "").toLowerCase() === DEFAULT_SENDER_EMAIL
      ? ""
      : target.fromEmail || ""
  );
  const [saving, setSaving] = useState(false);

  const canSubmit = firstname.trim() && email.trim() && company.trim() && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/outreach/targets/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          firstname,
          lastname,
          email,
          company,
          language,
          // Sans le droit de choisir, on n'envoie pas le champ : la boîte
          // configurée par l'admin est conservée telle quelle.
          ...(allowSenderChoice ? { fromEmail: fromEmail || null } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F0EBE4" }}>
          <h2 className="font-semibold" style={{ color: LICORICE }}>
            Modifier le client
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Marque / société *</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: "#E5E0DA" }}
            />
            {company.trim() !== target.company && (
              <p className="text-xs text-gray-400 mt-1">
                Le client sera rattaché à cette marque (créée dans le CRM si besoin).
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
              <input
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: "#E5E0DA" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
              <input
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: "#E5E0DA" }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: "#E5E0DA" }}
            />
            {email.trim().toLowerCase() !== target.email.toLowerCase() && (
              <p className="text-xs text-amber-600 mt-1">
                Attention : l&apos;historique des mails déjà envoyés reste lié à l&apos;ancien email.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Langue du client</label>
            <div className="flex gap-1.5">
              {(["fr", "en"] as const).map((lang) => {
                const active = language === lang;
                return (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition"
                    style={
                      active
                        ? { borderColor: LICORICE, backgroundColor: LICORICE, color: "white" }
                        : { borderColor: "#E5E0DA", backgroundColor: "white", color: LICORICE }
                    }
                  >
                    {lang === "fr" ? "Français" : "English"}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              La relance auto J+3 partira dans cette langue.
            </p>
          </div>
          {allowSenderChoice && senderAccounts.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Boîte d&apos;envoi</label>
              <select
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: "#E5E0DA" }}
              >
                <option value="">Leyna (par défaut) — {DEFAULT_SENDER_EMAIL}</option>
                {senderAccounts
                  .filter((a) => a.email.toLowerCase() !== DEFAULT_SENDER_EMAIL)
                  .map((a) => (
                    <option key={a.email} value={a.email}>
                      {a.label} — {a.email}
                    </option>
                  ))}
              </select>
              {(fromEmail || "").toLowerCase() !==
                ((target.fromEmail || "").toLowerCase() === DEFAULT_SENDER_EMAIL
                  ? ""
                  : (target.fromEmail || "").toLowerCase()) && (
                <p className="text-xs text-amber-600 mt-1">
                  Les prochains mails partiront de cette boîte. Les relances des mails
                  déjà envoyés restent sur l&apos;ancienne boîte (même fil Gmail).
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "#F0EBE4" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: LICORICE }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contact de carto en attente d'email                                 */
/* ------------------------------------------------------------------ */

function PendingContactRow({
  contact,
  busy,
  onAdd,
}: {
  contact: PendingContact;
  busy: boolean;
  onAdd: (email: string) => void;
}) {
  const [email, setEmail] = useState(contact.email || "");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center gap-3 border-b last:border-b-0" style={{ borderColor: "#F5F1EB" }}>
      <div className="min-w-[200px] flex-1">
        <div className="font-medium text-sm flex items-center gap-2" style={{ color: LICORICE }}>
          {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
          {contact.priorite && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={
                contact.priorite.toUpperCase() === "P1"
                  ? { backgroundColor: "#FDE8E8", color: "#B91C1C" }
                  : contact.priorite.toUpperCase() === "P2"
                    ? { backgroundColor: "#FFF7E8", color: "#8A6D1A" }
                    : { backgroundColor: "#F0F0F0", color: "#666" }
              }
            >
              {contact.priorite}
            </span>
          )}
          {contact.linkedinUrl && (
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-normal underline"
              style={{ color: "#2563A8" }}
            >
              LinkedIn
            </a>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[420px]">
          {[contact.poste, contact.perimetre, contact.localisation].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !busy) onAdd(email.trim().toLowerCase());
          }}
          placeholder="Note l'email…"
          className="w-56 px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
          style={{ borderColor: "#E5E0DA" }}
          disabled={busy}
        />
        <button
          onClick={() => onAdd(email.trim().toLowerCase())}
          disabled={!valid || busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: LICORICE }}
          title="Enregistre l'email sur la fiche marque et lance le cycle de contact"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          Lancer
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal : import d'une cartographie (fichier Claude / Excel collé)    */
/* ------------------------------------------------------------------ */

type CartoParsedRow = {
  priorite: string;
  prenom: string;
  nom: string;
  poste: string;
  perimetre: string;
  localisation: string;
  linkedinUrl: string;
  email: string;
};

/** Valeur de cellule ExcelJS → texte (gère liens, texte riche, formules). */
function excelCellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/[\t\r\n]+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.hyperlink === "string") {
      const link = o.hyperlink;
      // Les emails sont souvent des liens mailto: dans Excel
      return link.startsWith("mailto:") ? link.slice(7) : link;
    }
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((r) => r.text || "")
        .join("")
        .replace(/[\t\r\n]+/g, " ")
        .trim();
    }
    if (o.text != null) return excelCellToText(o.text);
    if (o.result != null) return excelCellToText(o.result);
  }
  return "";
}

/**
 * Lit un fichier de carto (.xlsx via ExcelJS, sinon texte .csv/.tsv) et le
 * convertit en texte tabulé pour le parseur commun.
 */
async function cartoFileToText(file: File): Promise<string> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("Le fichier Excel ne contient aucune feuille.");

    const lines: string[] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as unknown[]; // index 1-based
      const cells: string[] = [];
      for (let col = 1; col < Math.max(values.length, 2); col++) {
        cells.push(excelCellToText(values[col]));
      }
      lines.push(cells.join("\t"));
    });
    return lines.join("\n");
  }
  if (/\.(xls|numbers)$/i.test(file.name)) {
    throw new Error(
      "Format non géré — enregistre le fichier en .xlsx ou .csv et réessaie."
    );
  }
  return file.text();
}

/**
 * Parse un tableau collé depuis Excel / Google Sheets (TSV) ou un CSV.
 * Détecte la ligne d'en-tête (Priorité, Prénom, Nom, Rôle, Périmètre,
 * Localisation, Statut, URL LinkedIn…) et propose le nom de la marque
 * depuis la ligne de titre (« Bonsoirs — Top Contacts Influence »).
 */
function parseCartoText(text: string): {
  rows: CartoParsedRow[];
  suggestedCompany: string;
  error: string | null;
} {
  const lines = text.split(/\r?\n/);
  const splitLine = (line: string): string[] =>
    line.includes("\t") ? line.split("\t") : line.split(";");

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map(norm);
    const prenomIdx = cells.findIndex((c) => c === "prenom" || c === "firstname" || c === "first name");
    const nomIdx = cells.findIndex((c) => c === "nom" || c === "lastname" || c === "last name");
    if (prenomIdx >= 0 && nomIdx >= 0) {
      headerIdx = i;
      cols = { prenom: prenomIdx, nom: nomIdx };
      cells.forEach((c, idx) => {
        if (c.startsWith("prior")) cols.priorite = idx;
        else if (c.includes("role") || c === "poste" || c === "titre") cols.poste = idx;
        else if (c.startsWith("perim")) cols.perimetre = idx;
        else if (c.startsWith("local")) cols.localisation = idx;
        else if (c.includes("linkedin")) cols.linkedinUrl = idx;
        else if (c.includes("mail")) cols.email = idx;
      });
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      rows: [],
      suggestedCompany: "",
      error:
        "Impossible de trouver la ligne d'en-tête (colonnes « Prénom » et « Nom »). Colle le tableau avec ses titres de colonnes.",
    };
  }

  // Nom de marque suggéré depuis le titre au-dessus du tableau
  let suggestedCompany = "";
  for (let i = 0; i < headerIdx; i++) {
    const first = splitLine(lines[i])[0]?.trim();
    if (first) {
      suggestedCompany = first.split(/—|–|-{2,}/)[0].trim();
      break;
    }
  }

  const cell = (cells: string[], key: string): string =>
    cols[key] !== undefined ? (cells[cols[key]] || "").trim() : "";

  const rows: CartoParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const prenom = cell(cells, "prenom");
    const nom = cell(cells, "nom");
    if (!prenom && !nom) continue;
    rows.push({
      priorite: cell(cells, "priorite"),
      prenom,
      nom,
      poste: cell(cells, "poste"),
      perimetre: cell(cells, "perimetre"),
      localisation: cell(cells, "localisation"),
      linkedinUrl: cell(cells, "linkedinUrl"),
      email: cell(cells, "email"),
    });
  }

  return {
    rows,
    suggestedCompany,
    error: rows.length === 0 ? "Aucun contact trouvé sous la ligne d'en-tête." : null,
  };
}

function ImportCartoModal({
  onClose,
  onImported,
  onError,
}: {
  onClose: () => void;
  onImported: (company: string, created: number, skipped: number, addedToCycle: number) => void;
  onError: (message: string) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<CartoParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Marque : recherche CRM (réutilise l'autocomplete du module)
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MarqueOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMarque, setSelectedMarque] = useState<MarqueOption | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [language, setLanguage] = useState<"fr" | "en" | null>(null);
  // Override de langue par contact (index → langue). Sinon on applique le
  // choix global ci-dessus à tous les contacts.
  const [rowLangs, setRowLangs] = useState<Record<number, "fr" | "en">>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedMarque || createMode) return;
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/outreach/marques?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (res.ok) setOptions(data.marques || []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selectedMarque, createMode]);

  const handlePaste = (text: string, sourceFileName?: string) => {
    setRawText(text);
    setRowLangs({});
    if (!text.trim()) {
      setParsed([]);
      setParseError(null);
      return;
    }
    const result = parseCartoText(text);
    setParsed(result.rows);
    setParseError(result.error);
    // Pré-remplit la recherche marque depuis le titre du tableau, sinon
    // depuis le nom du fichier (« Bonsoirs - Top Contacts.xlsx » → Bonsoirs)
    const suggestion =
      result.suggestedCompany ||
      (sourceFileName
        ? sourceFileName
            .replace(/\.[^.]+$/, "")
            .split(/—|–|_|-/)[0]
            .trim()
        : "");
    if (suggestion && !selectedMarque && !query.trim()) {
      setQuery(suggestion);
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setFileLoading(true);
    setParseError(null);
    try {
      const text = await cartoFileToText(file);
      setFileName(file.name);
      setFileObj(file);
      handlePaste(text, file.name);
    } catch (e) {
      setFileName(null);
      setFileObj(null);
      setParseError(e instanceof Error ? e.message : "Impossible de lire ce fichier.");
    } finally {
      setFileLoading(false);
    }
  };

  const companyChosen = Boolean(selectedMarque) || (createMode && query.trim());
  const canSubmit =
    companyChosen && parsed.length > 0 && language !== null && !saving;

  /** Encode le fichier original en base64 pour le conserver sur la fiche marque. */
  const encodeFile = async (file: File): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const filePayload =
        fileObj && fileObj.size <= 10 * 1024 * 1024
          ? { name: fileObj.name, type: fileObj.type, base64: await encodeFile(fileObj) }
          : undefined;

      const res = await fetch("/api/outreach/import-carto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marqueId: selectedMarque?.id || undefined,
          company: selectedMarque ? undefined : query.trim(),
          rows: parsed.map((row, i) => ({
            ...row,
            language: rowLangs[i] ?? language,
          })),
          language,
          file: filePayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur d'import");
      onImported(data.company, data.created, data.skipped, data.addedToCycle || 0);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur d'import");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10" style={{ borderColor: "#F0EBE4" }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: LICORICE }}>
            <FileSpreadsheet className="w-4 h-4" style={{ color: "#3D8B40" }} />
            Importer une cartographie de contacts
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            Importe directement le fichier Excel généré par Claude (ou colle le tableau).
            Les contacts sont rattachés à la fiche marque — visible par toute
            l&apos;équipe — et apparaissent dans « À contacter » : il ne reste qu&apos;à
            noter l&apos;email de chacun pour lancer le cycle.
          </p>

          {/* ---------- 1. Le fichier ---------- */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
              1. Le fichier
            </label>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition"
              style={{
                borderColor: dragOver ? "#3D8B40" : fileName ? TEA_GREEN : "#E5E0DA",
                backgroundColor: dragOver ? "#F2FAF2" : fileName ? "#F8FCEF" : "#FBF8F4",
              }}
            >
              <input
                type="file"
                accept=".xlsx,.csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {fileLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#3D8B40" }} />
              ) : (
                <FileSpreadsheet className="w-6 h-6" style={{ color: "#3D8B40" }} />
              )}
              {fileName ? (
                <>
                  <span className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {fileName}
                  </span>
                  <span className="text-xs text-gray-500">
                    Clique ou glisse un autre fichier pour remplacer
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold" style={{ color: LICORICE }}>
                    Glisse le fichier ici, ou clique pour le choisir
                  </span>
                  <span className="text-xs text-gray-500">Excel (.xlsx) ou CSV</span>
                </>
              )}
            </label>

            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer select-none">
                …ou colle le tableau à la main
              </summary>
              <textarea
                value={rawText}
                onChange={(e) => {
                  setFileName(null);
                  setFileObj(null);
                  handlePaste(e.target.value);
                }}
                placeholder={"Colle ici le tableau…\nPriorité\tPrénom\tNom\tRôle\tPérimètre\tLocalisation\tStatut\tURL LinkedIn"}
                rows={5}
                className="w-full mt-2 px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2"
                style={{ borderColor: "#E5E0DA" }}
              />
            </details>

            {parseError && (rawText.trim() || fileName) && (
              <p className="text-xs text-red-600 mt-1">{parseError}</p>
            )}
            {parsed.length > 0 && (
              <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: "#E5E0DA" }}>
                <div className="px-3 py-2 text-xs font-semibold border-b" style={{ backgroundColor: "#FBF8F4", borderColor: "#F0EBE4", color: LICORICE }}>
                  {parsed.length} contact{parsed.length > 1 ? "s" : ""} détecté{parsed.length > 1 ? "s" : ""}
                </div>
                <div className="max-h-44 overflow-y-auto divide-y" style={{ borderColor: "#F5F1EB" }}>
                  {parsed.map((row, i) => {
                    const rowLang = rowLangs[i] ?? language;
                    return (
                    <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                      {row.priorite && (
                        <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-gray-100 text-gray-600 shrink-0">
                          {row.priorite}
                        </span>
                      )}
                      <span className="font-medium shrink-0" style={{ color: LICORICE }}>
                        {row.prenom} {row.nom}
                      </span>
                      <span className="text-gray-500 truncate">{row.poste}</span>
                      <span className="ml-auto shrink-0 flex items-center gap-2">
                        {row.email ? (
                          <span className="font-medium" style={{ color: "#3D8B40" }} title="Email présent → entre directement dans « À contacter »">
                            {row.email}
                          </span>
                        ) : (
                          <span className="text-gray-400" title="Sans email : restera en attente, à compléter dans /outreach">
                            email à noter
                          </span>
                        )}
                        {row.linkedinUrl && (
                          <span style={{ color: "#2563A8" }}>LinkedIn ✓</span>
                        )}
                        <span
                          className="inline-flex rounded-md overflow-hidden border shrink-0"
                          style={{ borderColor: "#E5E0DA" }}
                          title="Langue de ce contact"
                        >
                          {(["fr", "en"] as const).map((lang) => {
                            const active = rowLang === lang;
                            return (
                              <button
                                key={lang}
                                type="button"
                                onClick={() =>
                                  setRowLangs((prev) => ({ ...prev, [i]: lang }))
                                }
                                className="px-1.5 py-0.5 text-[10px] font-bold uppercase transition"
                                style={
                                  active
                                    ? { backgroundColor: LICORICE, color: "white" }
                                    : { backgroundColor: "white", color: "#9CA3AF" }
                                }
                              >
                                {lang === "fr" ? "🇫🇷" : "🇬🇧"} {lang}
                              </button>
                            );
                          })}
                        </span>
                      </span>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ---------- 2. La marque ---------- */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
              2. La marque
            </label>
            {selectedMarque ? (
              <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: TEA_GREEN, backgroundColor: "#F8FCEF" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {selectedMarque.nom}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[selectedMarque.secteur, selectedMarque.ville].filter(Boolean).join(" · ") || "Fiche CRM existante"}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedMarque(null);
                    setCreateMode(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Changer
                </button>
              </div>
            ) : createMode ? (
              <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "#E5E0DA", backgroundColor: "#FBF8F4" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {query.trim() || "—"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Nouvelle marque — sera créée dans le CRM</div>
                </div>
                <button onClick={() => setCreateMode(false)} className="text-xs text-gray-500 hover:text-gray-800 underline">
                  Changer
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cherche la marque dans le CRM…"
                  className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: "#E5E0DA" }}
                />
                {searching && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-2.5 text-gray-400" />
                )}
                {query.trim().length >= 2 && !searching && (
                  <div className="mt-1.5 rounded-xl border divide-y overflow-hidden" style={{ borderColor: "#E5E0DA" }}>
                    {options.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMarque(m)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium" style={{ color: LICORICE }}>
                          {m.nom}
                        </span>
                        <span className="text-xs text-gray-400">
                          {[m.secteur, m.ville].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => setCreateMode(true)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                      style={{ color: OLD_ROSE }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Créer « {query.trim()} »
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---------- 3. La langue du client ---------- */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
              3. Langue des contacts <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1.5">
              {(["fr", "en"] as const).map((lang) => {
                const active = language === lang;
                return (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang);
                      // « Appliquer à tous » : on efface les choix individuels.
                      setRowLangs({});
                    }}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition"
                    style={
                      active
                        ? { borderColor: LICORICE, backgroundColor: LICORICE, color: "white" }
                        : { borderColor: "#E5E0DA", backgroundColor: "white", color: LICORICE }
                    }
                  >
                    {lang === "fr" ? "Tous en français" : "Tous en anglais"}
                  </button>
                );
              })}
            </div>
            {language === null ? (
              <p className="text-xs mt-1" style={{ color: OLD_ROSE }}>
                Choix obligatoire : applique une langue à tous, puis ajuste contact par
                contact dans la liste ci-dessus si certains parlent l&apos;autre langue.
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Langue appliquée à tous par défaut — modifiable individuellement (boutons
                🇫🇷/🇬🇧 sur chaque contact). Mails et relances auto adaptés.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white rounded-b-2xl" style={{ borderColor: "#F0EBE4" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: LICORICE }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Importer {parsed.length > 0 ? `${parsed.length} contact${parsed.length > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
