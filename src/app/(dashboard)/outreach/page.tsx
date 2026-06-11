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
} from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const ALLOWED = ["ADMIN", "CASTING_MANAGER"];

type TargetStatus = "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED";

type TouchSummary = {
  id: string;
  cycleNumber: number;
  subject: string;
  sentAt: string | null;
  relanceSentAt: string | null;
  repliedAt: string | null;
  openCount: number;
  clickCount: number;
  sendError: string | null;
};

type Touch = TouchSummary & {
  bodyHtml: string;
  relanceError: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  lastClickUrl: string | null;
};

type Target = {
  id: string;
  marqueId: string;
  firstname: string;
  lastname: string | null;
  email: string;
  company: string;
  fromEmail: string | null;
  status: TargetStatus;
  draftSubject: string | null;
  draftBodyHtml: string | null;
  cycleCount: number;
  lastSentAt: string | null;
  nextRecontactAt: string | null;
  lastRepliedAt: string | null;
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

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
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
    return Array.from(map.values());
  }, [visibleTargets, pendingContacts, activeTab]);

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
      draft?: { subject: string; bodyHtml: string }
    ) => {
      const group = composerGroup;
      if (!group) return;
      const ids = group.targets.map((t) => t.id);

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
          const confirmed = window.confirm(
            group.targets.length > 1
              ? `Envoyer ce mail aux ${group.targets.length} contacts de ${group.company} ?\n\n${recipients}\n\nChacun reçoit son propre mail personnalisé (thread et relances séparés).\n\nAnnuler = garder en brouillon.`
              : `Envoyer ce mail à ${recipients} depuis la boîte de Leyna ?\n\nAnnuler = garder en brouillon.`
          );
          await saveDraft(ids, draft?.subject || "", draft?.bodyHtml || "");
          if (!confirmed) {
            flash("success", "Brouillon enregistré (mail non envoyé).");
            await loadTargets();
            return;
          }

          const res = await fetch("/api/outreach/send-bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetIds: ids,
              subject: draft?.subject || "",
              bodyHtml: draft?.bodyHtml || "",
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Erreur d'envoi");

          const failed: { email: string; error: string }[] = data.failed || [];
          if (data.sent > 0) {
            flash(
              "success",
              `${data.sent} mail${data.sent > 1 ? "s" : ""} envoyé${data.sent > 1 ? "s" : ""} (${group.company}) — compteur 45 jours relancé${
                failed.length > 0 ? ` · ${failed.length} échec${failed.length > 1 ? "s" : ""}` : ""
              }.`
            );
          }
          if (failed.length > 0 && data.sent === 0) {
            flash("error", failed.map((f) => `${f.email} : ${f.error}`).join(" | "));
          }
          await loadTargets();
        } catch (e) {
          flash("error", e instanceof Error ? e.message : "Erreur");
        }
      })();
    },
    [composerGroup, saveDraft, flash, loadTargets]
  );

  const handleRelanceNow = useCallback(
    async (target: Target) => {
      if (!window.confirm(`Envoyer une relance dans le thread du dernier mail à ${target.email} ?`)) return;
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

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed" style={{ borderColor: "#E5E0DA", backgroundColor: "#FBF8F4" }}>
          <Mail className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            {activeTab === "TO_CONTACT" && "Aucun nouveau client à contacter. Ajoute un client pour démarrer."}
            {activeTab === "WAITING" && "Aucun client en attente."}
            {activeTab === "TO_RECONTACT" && "Aucun client à recontacter pour l'instant."}
            {activeTab === "STOPPED" && "Aucun client stoppé."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => {
            const groupBusy = group.targets.some((t) => actionBusy === t.id);
            const canCompose = activeTab !== "STOPPED";
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
                </div>

                {/* Contacts de la marque */}
                {group.targets.map((target) => {
                  const latest = target.touches[0] || null;
                  const days = daysUntil(target.nextRecontactAt);
                  const expanded = expandedId === target.id;
                  const busy = actionBusy === target.id;
                  return (
                    <div key={target.id} className="border-b last:border-b-0" style={{ borderColor: "#F5F1EB" }}>
                      <div className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                        {/* Identité */}
                        <div className="min-w-[200px] flex-1">
                          <div className="font-medium text-sm" style={{ color: LICORICE }}>
                            {target.firstname} {target.lastname || ""}
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
                          {target.lastRepliedAt && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: TEA_GREEN, color: LICORICE }}>
                              <MessageSquareReply className="w-3 h-3" />
                              A répondu
                            </span>
                          )}
                          {latest?.relanceSentAt && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                              Relancé J+3
                            </span>
                          )}
                          {latest && latest.openCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <Eye className="w-3.5 h-3.5" />
                              {latest.openCount}
                            </span>
                          )}
                          {latest && latest.clickCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-gray-500">
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
                                    <span className="inline-flex items-center gap-1 text-gray-400 ml-auto">
                                      <Eye className="w-3 h-3" /> {touch.openCount}
                                      <MousePointerClick className="w-3 h-3 ml-2" /> {touch.clickCount}
                                    </span>
                                  </div>
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
        onClose={() => setComposerGroup(null)}
        onSaved={handleComposerSaved}
        onError={(m) => flash("error", m)}
        onSuccess={() => {}}
      />
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
  const canSubmit = companyChosen && firstname.trim() && email.trim() && !saving;

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
  const canSubmit = companyChosen && parsed.length > 0 && !saving;

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
          rows: parsed,
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
                  {parsed.map((row, i) => (
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
                      </span>
                    </div>
                  ))}
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
